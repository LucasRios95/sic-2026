import { v7 as uuidv7 } from 'uuid';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CertificateMetadata,
  ICertificateVault,
  RetrievedCertificate,
  StoredCertificate,
} from '../ICertificateVault';
import {
  EncryptedPayload,
  decryptSecret,
  encryptSecret,
  loadVaultMasterKey,
} from './vaultCrypto';

interface VaultDbPayload {
  metadata: CertificateMetadata;
  passwordEnc: EncryptedPayload;
  contentEnc: EncryptedPayload;
  version: 1;
}

/**
 * Cofre de certificados persistido no PRÓPRIO Postgres (tabela `certificate_vault_entries`),
 * com o conteúdo cifrado por AES-256-GCM (mesma cripto do driver filesystem). Pensado para
 * deploys em nuvem (Railway etc.) onde o filesystem é efêmero e volumes não são compartilhados
 * entre serviços: assim backend e worker leem o mesmo cofre via banco.
 *
 * Usa SQL direto via `appDataSource` (sem entity/registro extra) — o payload vai numa coluna
 * `jsonb`. O `vaultRef` (`db:<uuid>`) é opaco, guardado em `certificates.vault_ref`.
 *
 * Habilitar com `VAULT_DRIVER=db`. A tabela é criada pela migration
 * CreateCertificateVaultSchema. A chave-mestra continua vindo de `VAULT_MASTER_KEY`.
 */
export class PostgresCertificateVault implements ICertificateVault {
  private readonly masterKey: Buffer;

  constructor(options: { masterKey?: Buffer } = {}) {
    this.masterKey = loadVaultMasterKey(options.masterKey);
  }

  async store(input: {
    metadata: CertificateMetadata;
    content: Buffer;
    password: string;
  }): Promise<StoredCertificate> {
    const vaultRef = `db:${uuidv7()}`;
    const payload: VaultDbPayload = {
      metadata: input.metadata,
      passwordEnc: encryptSecret(this.masterKey, Buffer.from(input.password, 'utf8')),
      contentEnc: encryptSecret(this.masterKey, input.content),
      version: 1,
    };
    await appDataSource.query(
      `INSERT INTO "certificate_vault_entries" ("vault_ref", "payload") VALUES ($1, $2)`,
      [vaultRef, JSON.stringify(payload)],
    );
    return { vaultRef, metadata: input.metadata };
  }

  async retrieve(vaultRef: string): Promise<RetrievedCertificate> {
    const rows = (await appDataSource.query(
      `SELECT "payload" FROM "certificate_vault_entries" WHERE "vault_ref" = $1`,
      [vaultRef],
    )) as Array<{ payload: VaultDbPayload }>;
    const row = rows[0];
    if (!row) throw new Error(`Certificado não encontrado no cofre: ${vaultRef}`);
    // jsonb é desserializado pelo driver pg como objeto.
    const payload = row.payload;
    return {
      metadata: this.normalizeMetadata(payload.metadata),
      content: decryptSecret(this.masterKey, payload.contentEnc),
      password: decryptSecret(this.masterKey, payload.passwordEnc).toString('utf8'),
    };
  }

  async revoke(vaultRef: string): Promise<void> {
    // Idempotente: DELETE de algo inexistente não é erro.
    await appDataSource.query(
      `DELETE FROM "certificate_vault_entries" WHERE "vault_ref" = $1`,
      [vaultRef],
    );
  }

  async list(): Promise<StoredCertificate[]> {
    const rows = (await appDataSource.query(
      `SELECT "vault_ref", "payload" FROM "certificate_vault_entries" ORDER BY "created_at" ASC`,
    )) as Array<{ vault_ref: string; payload: VaultDbPayload }>;
    return rows.map((r) => ({
      vaultRef: r.vault_ref,
      metadata: this.normalizeMetadata(r.payload.metadata),
    }));
  }

  private normalizeMetadata(raw: CertificateMetadata): CertificateMetadata {
    // jsonb devolve datas como string; reconstrói Date para o contrato.
    return {
      ...raw,
      validFrom: new Date(raw.validFrom),
      validTo: new Date(raw.validTo),
    };
  }
}

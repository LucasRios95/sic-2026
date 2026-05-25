import crypto from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { v7 as uuidv7 } from 'uuid';

import { env } from '@config/env';

import {
  CertificateMetadata,
  ICertificateVault,
  RetrievedCertificate,
  StoredCertificate,
} from '../ICertificateVault';

interface VaultFilePayload {
  metadata: CertificateMetadata;
  passwordEnc: { iv: string; tag: string; ct: string };
  contentEnc: { iv: string; tag: string; ct: string };
  version: 1;
}

export interface FileSystemVaultOptions {
  basePath?: string;
  masterKey?: Buffer;
}

/**
 * Cofre de segredos persistente em disco, com criptografia AES-256-GCM. Pensado para
 * dev/homologação — em produção, troque pelo HashiCorp Vault ou AWS Secrets Manager.
 *
 * Estrutura:
 *  - cada certificado → um arquivo JSON em `${basePath}/<vaultRef>.json`
 *  - chave de criptografia: `masterKey` injetada via construtor; quando ausente, lê de
 *    `env.VAULT_MASTER_KEY` (32 bytes em base64). Permitir override no construtor torna o
 *    adapter testável sem mexer em process.env.
 *  - IV gerado por chamada (nunca reusado); tag de autenticação verifica integridade.
 *
 * O `vaultRef` retornado é opaco — o chamador guarda em `certificates.vault_ref` e
 * sempre acessa o conteúdo via este adapter, jamais lendo o arquivo direto.
 */
export class FileSystemCertificateVault implements ICertificateVault {
  private readonly basePath: string;
  private readonly masterKey: Buffer;

  constructor(options: FileSystemVaultOptions = {}) {
    this.basePath = path.resolve(options.basePath ?? env.VAULT_PATH);
    const key = options.masterKey ?? this.loadMasterKeyFromEnv();
    if (key.length !== 32) {
      throw new Error('VAULT_MASTER_KEY deve ter 32 bytes (base64 de 44 caracteres)');
    }
    this.masterKey = key;
  }

  private loadMasterKeyFromEnv(): Buffer {
    if (!env.VAULT_MASTER_KEY) {
      throw new Error(
        'VAULT_MASTER_KEY não configurada — necessária para FileSystemCertificateVault. ' +
          'Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }
    return Buffer.from(env.VAULT_MASTER_KEY, 'base64');
  }

  async store(input: {
    metadata: CertificateMetadata;
    content: Buffer;
    password: string;
  }): Promise<StoredCertificate> {
    await this.ensureDir();
    const vaultRef = `fs:${uuidv7()}`;
    const payload: VaultFilePayload = {
      metadata: input.metadata,
      passwordEnc: this.encrypt(Buffer.from(input.password, 'utf8')),
      contentEnc: this.encrypt(input.content),
      version: 1,
    };
    await writeFile(this.filePath(vaultRef), JSON.stringify(payload), {
      mode: 0o600,
    });
    return { vaultRef, metadata: input.metadata };
  }

  async retrieve(vaultRef: string): Promise<RetrievedCertificate> {
    const raw = await readFile(this.filePath(vaultRef), 'utf8');
    const payload = JSON.parse(raw) as VaultFilePayload;
    return {
      metadata: this.normalizeMetadata(payload.metadata),
      content: this.decrypt(payload.contentEnc),
      password: this.decrypt(payload.passwordEnc).toString('utf8'),
    };
  }

  async revoke(vaultRef: string): Promise<void> {
    try {
      await unlink(this.filePath(vaultRef));
    } catch (err) {
      // Idempotente: revogar algo que não existe não é erro.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async list(): Promise<StoredCertificate[]> {
    await this.ensureDir();
    const files = await readdir(this.basePath);
    const result: StoredCertificate[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(path.join(this.basePath, file), 'utf8');
        const payload = JSON.parse(raw) as VaultFilePayload;
        result.push({
          vaultRef: `fs:${path.basename(file, '.json')}`,
          metadata: this.normalizeMetadata(payload.metadata),
        });
      } catch {
        // Arquivo corrompido ou outro tipo — pula sem derrubar a listagem.
      }
    }
    return result;
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
  }

  private filePath(vaultRef: string): string {
    const id = vaultRef.replace(/^fs:/, '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error(`vaultRef inválido: ${vaultRef}`);
    }
    return path.join(this.basePath, `${id}.json`);
  }

  private encrypt(plaintext: Buffer): { iv: string; tag: string; ct: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ct: ct.toString('base64'),
    };
  }

  private decrypt(payload: { iv: string; tag: string; ct: string }): Buffer {
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const ct = Buffer.from(payload.ct, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  private normalizeMetadata(raw: CertificateMetadata): CertificateMetadata {
    // JSON.parse devolve string nas datas; reconstrói Date para o contrato.
    return {
      ...raw,
      validFrom: new Date(raw.validFrom),
      validTo: new Date(raw.validTo),
    };
  }
}

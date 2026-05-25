import { v7 as uuidv7 } from 'uuid';

import {
  CertificateMetadata,
  ICertificateVault,
  RetrievedCertificate,
  StoredCertificate,
} from '../ICertificateVault';

/**
 * Adapter de cofre em memória. Útil para testes (sem I/O) e para dev quando o disco
 * não está disponível. Perde tudo no restart.
 */
export class InMemoryCertificateVault implements ICertificateVault {
  private readonly storage = new Map<
    string,
    { metadata: CertificateMetadata; content: Buffer; password: string }
  >();

  async store(input: {
    metadata: CertificateMetadata;
    content: Buffer;
    password: string;
  }): Promise<StoredCertificate> {
    const vaultRef = `mem:${uuidv7()}`;
    this.storage.set(vaultRef, {
      metadata: input.metadata,
      content: Buffer.from(input.content),
      password: input.password,
    });
    return { vaultRef, metadata: input.metadata };
  }

  async retrieve(vaultRef: string): Promise<RetrievedCertificate> {
    const entry = this.storage.get(vaultRef);
    if (!entry) {
      throw new Error(`Certificado ${vaultRef} não encontrado no cofre em memória`);
    }
    return { ...entry };
  }

  async revoke(vaultRef: string): Promise<void> {
    this.storage.delete(vaultRef);
  }

  async list(): Promise<StoredCertificate[]> {
    return [...this.storage.entries()].map(([vaultRef, entry]) => ({
      vaultRef,
      metadata: entry.metadata,
    }));
  }
}

import crypto from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CertificateMetadata } from '@shared/container/providers/CertificateVault/ICertificateVault';
import { FileSystemCertificateVault } from '@shared/container/providers/CertificateVault/implementations/FileSystemCertificateVault';

function makeMetadata(): CertificateMetadata {
  return {
    alias: 'Empresa Demo A1 2026',
    type: 'A1',
    subject: 'CN=DEMO',
    serialNumber: 'serial',
    thumbprint: 'thumb',
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: new Date('2027-01-01T00:00:00Z'),
  };
}

describe('FileSystemCertificateVault', () => {
  let dir: string;
  let masterKey: Buffer;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'vault-test-'));
    masterKey = crypto.randomBytes(32);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('persiste com AES-256-GCM e recupera bit-a-bit', async () => {
    const vault = new FileSystemCertificateVault({ basePath: dir, masterKey });
    const content = crypto.randomBytes(2048); // 2KB de bytes aleatórios — simula PFX

    const stored = await vault.store({ metadata: makeMetadata(), content, password: 's3cr3t' });
    expect(stored.vaultRef).toMatch(/^fs:/);

    const retrieved = await vault.retrieve(stored.vaultRef);
    expect(retrieved.content.equals(content)).toBe(true);
    expect(retrieved.password).toBe('s3cr3t');
  });

  it('chaves diferentes não conseguem ler o segredo (autenticação AES-GCM)', async () => {
    const vault = new FileSystemCertificateVault({ basePath: dir, masterKey });
    const stored = await vault.store({
      metadata: makeMetadata(),
      content: Buffer.from('payload'),
      password: 'p',
    });

    const otherKey = crypto.randomBytes(32);
    const otherVault = new FileSystemCertificateVault({ basePath: dir, masterKey: otherKey });
    await expect(otherVault.retrieve(stored.vaultRef)).rejects.toThrow();
  });

  it('revoga apagando o arquivo (idempotente)', async () => {
    const vault = new FileSystemCertificateVault({ basePath: dir, masterKey });
    const stored = await vault.store({
      metadata: makeMetadata(),
      content: Buffer.from('x'),
      password: 'p',
    });
    await vault.revoke(stored.vaultRef);
    await expect(vault.retrieve(stored.vaultRef)).rejects.toThrow();
    // Revogar de novo não é erro.
    await expect(vault.revoke(stored.vaultRef)).resolves.toBeUndefined();
  });

  it('list exclui arquivos inválidos do diretório (robustez)', async () => {
    const vault = new FileSystemCertificateVault({ basePath: dir, masterKey });
    await vault.store({
      metadata: makeMetadata(),
      content: Buffer.from('a'),
      password: 'p',
    });
    await writeFile(path.join(dir, 'corrupted.json'), 'not json');

    const list = await vault.list();
    expect(list).toHaveLength(1);
    expect(list[0].metadata.alias).toBe('Empresa Demo A1 2026');
  });

  it('rejeita masterKey de tamanho errado', () => {
    expect(
      () => new FileSystemCertificateVault({ basePath: dir, masterKey: Buffer.from('curta') }),
    ).toThrow(/32 bytes/);
  });

  it('rejeita vaultRef com caracteres inválidos (segurança path traversal)', async () => {
    const vault = new FileSystemCertificateVault({ basePath: dir, masterKey });
    await expect(vault.retrieve('fs:../etc/passwd')).rejects.toThrow(/vaultRef inválido/);
  });
});

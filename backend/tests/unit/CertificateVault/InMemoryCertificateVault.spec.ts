import { describe, expect, it } from 'vitest';

import { CertificateMetadata } from '@shared/container/providers/CertificateVault/ICertificateVault';
import { InMemoryCertificateVault } from '@shared/container/providers/CertificateVault/implementations/InMemoryCertificateVault';

function makeMetadata(): CertificateMetadata {
  return {
    alias: 'Empresa Demo A1 2026',
    type: 'A1',
    subject: 'CN=EMPRESA DEMO LTDA:11222333000181',
    serialNumber: '01ABCD',
    thumbprint: 'abcd1234',
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: new Date('2027-01-01T00:00:00Z'),
  };
}

describe('InMemoryCertificateVault', () => {
  it('persiste, recupera e revoga ciclicamente', async () => {
    const vault = new InMemoryCertificateVault();
    const content = Buffer.from('fake-pfx-bytes', 'utf8');

    const stored = await vault.store({ metadata: makeMetadata(), content, password: 'segredo' });
    expect(stored.vaultRef).toMatch(/^mem:/);

    const retrieved = await vault.retrieve(stored.vaultRef);
    expect(retrieved.content.equals(content)).toBe(true);
    expect(retrieved.password).toBe('segredo');
    expect(retrieved.metadata.alias).toBe('Empresa Demo A1 2026');

    await vault.revoke(stored.vaultRef);
    await expect(vault.retrieve(stored.vaultRef)).rejects.toThrow(/não encontrado/);
  });

  it('list retorna metadados sem o conteúdo', async () => {
    const vault = new InMemoryCertificateVault();
    await vault.store({
      metadata: makeMetadata(),
      content: Buffer.from('a'),
      password: 'x',
    });
    await vault.store({
      metadata: { ...makeMetadata(), alias: 'Outra' },
      content: Buffer.from('b'),
      password: 'y',
    });

    const list = await vault.list();
    expect(list).toHaveLength(2);
    expect(list[0]).not.toHaveProperty('content');
    expect(list[0]).not.toHaveProperty('password');
  });
});

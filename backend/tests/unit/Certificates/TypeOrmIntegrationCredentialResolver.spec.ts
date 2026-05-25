import { describe, expect, it, vi } from 'vitest';

import { Certificate } from '@modules/Certificates/infra/typeorm/entities/Certificate';
import { ICertificateRepository } from '@modules/Certificates/repositories/ICertificateRepository';
import { TypeOrmIntegrationCredentialResolver } from '@modules/NFe/infra/queues/TypeOrmIntegrationCredentialResolver';

describe('TypeOrmIntegrationCredentialResolver', () => {
  it('devolve vaultRef quando há certificado ativo na empresa', async () => {
    const repo: ICertificateRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByThumbprint: vi.fn(),
      findActiveForCompany: vi.fn(async () => ({ vaultRef: 'fs:cert-1' }) as Certificate),
      listByCompany: vi.fn(),
      listExpiring: vi.fn(),
      revoke: vi.fn(),
    };
    const resolver = new TypeOrmIntegrationCredentialResolver(repo);
    const ref = await resolver.resolveCertificateRef('company-1');
    expect(ref).toBe('fs:cert-1');
  });

  it('devolve null quando empresa não tem certificado ativo', async () => {
    const repo: ICertificateRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByThumbprint: vi.fn(),
      findActiveForCompany: vi.fn(async () => null),
      listByCompany: vi.fn(),
      listExpiring: vi.fn(),
      revoke: vi.fn(),
    };
    const resolver = new TypeOrmIntegrationCredentialResolver(repo);
    expect(await resolver.resolveCertificateRef('company-sem-cert')).toBeNull();
  });
});

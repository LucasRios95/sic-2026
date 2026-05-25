import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as forge from 'node-forge';

import { AuditService } from '@modules/Auditoria/AuditService';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import { Certificate } from '@modules/Certificates/infra/typeorm/entities/Certificate';
import { ICertificateRepository } from '@modules/Certificates/repositories/ICertificateRepository';
import { UploadCertificateUseCase } from '@modules/Certificates/useCases/UploadCertificate/UploadCertificateUseCase';
import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';
import {
  ICertificateVault,
} from '@shared/container/providers/CertificateVault/ICertificateVault';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@shared/errors';

function makePfx(cn: string, password: string, validToOffset = 365 * 24 * 3600_000): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600_000);
  cert.validity.notAfter = new Date(Date.now() + validToOffset);
  const attrs = [
    { name: 'commonName', value: cn },
    { name: 'countryName', value: 'BR' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

function setup(opts: { companyCnpj?: string; existing?: Certificate | null } = {}) {
  const company = {
    id: 'company-1',
    cnpj: opts.companyCnpj ?? '11222333000181',
  } as Company;

  const certRepo: ICertificateRepository = {
    create: vi.fn(async (d) => ({ id: 'cert-1', vaultRef: d.vaultRef, ...d }) as unknown as Certificate),
    findById: vi.fn(),
    findByThumbprint: vi.fn(async () => opts.existing ?? null),
    findActiveForCompany: vi.fn(),
    listByCompany: vi.fn(),
    listExpiring: vi.fn(),
    revoke: vi.fn(),
  };
  const companyRepo: ICompanyRepository = {
    create: vi.fn(),
    findById: vi.fn(async () => company),
    findByCnpj: vi.fn(),
    findByIds: vi.fn(),
    listByTenant: vi.fn(),
  };
  const vault: ICertificateVault = {
    store: vi.fn(async () => ({ vaultRef: 'mem:abc', metadata: { alias: 't' } as unknown as never })),
    retrieve: vi.fn(),
    revoke: vi.fn(),
    list: vi.fn(),
  };
  const audit = new AuditService({ create: vi.fn(), list: vi.fn() } as unknown as IAuditLogRepository);
  const notifications = new NotificationService({
    create: vi.fn(),
    list: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  } as unknown as INotificationRepository);

  const useCase = new UploadCertificateUseCase(certRepo, companyRepo, vault, audit, notifications);
  return { useCase, certRepo, vault };
}

const baseRequest = (overrides: Partial<{ pfx: Buffer; password: string; alias?: string }> = {}) => {
  const password = overrides.password ?? 'senha-do-pfx';
  const pfx = overrides.pfx ?? makePfx('EMPRESA TESTE:11222333000181', password);
  return {
    companyId: 'company-1',
    userId: 'user-1',
    pfxBase64: pfx.toString('base64'),
    password,
    alias: overrides.alias,
  };
};

describe('UploadCertificateUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persiste cofre + registro quando o PFX é válido e CNPJ bate', async () => {
    const { useCase, certRepo, vault } = setup();
    const result = await useCase.execute(baseRequest());

    expect(vault.store).toHaveBeenCalledOnce();
    expect(certRepo.create).toHaveBeenCalledOnce();
    expect(result.certificate.vaultRef).toBe('mem:abc');
    expect(result.expiresInDays).toBeGreaterThan(60);
  });

  it('rejeita PFX cujo CNPJ não corresponde ao da empresa', async () => {
    const { useCase } = setup({ companyCnpj: '99888777000166' });
    await expect(useCase.execute(baseRequest())).rejects.toMatchObject({
      code: 'CERTIFICATE_CNPJ_MISMATCH',
    });
  });

  it('rejeita PFX já cadastrado (thumbprint duplicado)', async () => {
    const dupCert = { id: 'other-cert', companyId: 'company-1' } as Certificate;
    const { useCase, vault } = setup({ existing: dupCert });
    await expect(useCase.execute(baseRequest())).rejects.toMatchObject({
      code: 'CERTIFICATE_DUPLICATE_THUMBPRINT',
    });
    expect(vault.store).not.toHaveBeenCalled();
  });

  it('rejeita PFX já expirado', async () => {
    const expiredPfx = makePfx('EMPRESA TESTE:11222333000181', 'p', -10 * 86_400_000);
    const { useCase } = setup();
    await expect(
      useCase.execute(baseRequest({ pfx: expiredPfx, password: 'p' })),
    ).rejects.toMatchObject({ code: 'CERTIFICATE_EXPIRED' });
  });

  it('rejeita senha errada com ValidationError', async () => {
    const pfx = makePfx('EMPRESA TESTE:11222333000181', 'correta');
    const { useCase } = setup();
    await expect(
      useCase.execute({
        ...baseRequest(),
        pfxBase64: pfx.toString('base64'),
        password: 'errada',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejeita pfxBase64 muito pequeno', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        ...baseRequest(),
        pfxBase64: 'dGVzdGU=', // "teste" — minúsculo
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('empresa inexistente: NotFoundError', async () => {
    const { useCase } = setup();
    // Re-cria com findById devolvendo null
    const noCompany = setup();
    (noCompany as unknown as { useCase: UploadCertificateUseCase; certRepo: ICertificateRepository; vault: ICertificateVault });
    // Re-monta com company nula via factory direto:
    const certRepo: ICertificateRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByThumbprint: vi.fn(async () => null),
      findActiveForCompany: vi.fn(),
      listByCompany: vi.fn(),
      listExpiring: vi.fn(),
      revoke: vi.fn(),
    };
    const companyRepo: ICompanyRepository = {
      create: vi.fn(),
      findById: vi.fn(async () => null),
      findByCnpj: vi.fn(),
      findByIds: vi.fn(),
      listByTenant: vi.fn(),
    };
    const vault: ICertificateVault = {
      store: vi.fn(),
      retrieve: vi.fn(),
      revoke: vi.fn(),
      list: vi.fn(),
    };
    const audit = new AuditService({ create: vi.fn(), list: vi.fn() } as unknown as IAuditLogRepository);
    const notifications = new NotificationService({
      create: vi.fn(),
      list: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    } as unknown as INotificationRepository);
    const u2 = new UploadCertificateUseCase(certRepo, companyRepo, vault, audit, notifications);
    await expect(u2.execute(baseRequest())).rejects.toBeInstanceOf(NotFoundError);
    void useCase;
  });

  // BusinessRuleError importado para forçar referência simbólica explícita do mapeamento de erros.
  void BusinessRuleError;
});

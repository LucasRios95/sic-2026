import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '@modules/Auditoria/AuditService';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import {
  Certificate,
  CertificateType,
} from '@modules/Certificates/infra/typeorm/entities/Certificate';
import { ICertificateRepository } from '@modules/Certificates/repositories/ICertificateRepository';
import { NotifyExpiringCertificatesUseCase } from '@modules/Certificates/useCases/NotifyExpiringCertificates/NotifyExpiringCertificatesUseCase';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';

function makeCert(daysToExpiry: number, companyId = 'c-1', alias = 'Cert'): Certificate {
  return {
    id: `cert-${daysToExpiry}`,
    companyId,
    alias,
    tipo: CertificateType.A1,
    validTo: new Date(Date.now() + daysToExpiry * 86_400_000),
    active: true,
  } as Certificate;
}

function setup(returning: Certificate[]) {
  const repo: ICertificateRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByThumbprint: vi.fn(),
    findActiveForCompany: vi.fn(),
    listByCompany: vi.fn(),
    listExpiring: vi.fn(async () => returning),
    revoke: vi.fn(),
  };
  const notifRepo: INotificationRepository = {
    create: vi.fn(async (d) => ({ id: 'n-1', ...d }) as unknown as never),
    list: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  };
  const notifications = new NotificationService(notifRepo);
  const audit = new AuditService({ create: vi.fn(), list: vi.fn() } as unknown as IAuditLogRepository);

  const useCase = new NotifyExpiringCertificatesUseCase(repo, notifications, audit);
  return { useCase, notifRepo };
}

describe('NotifyExpiringCertificatesUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('classifica como ERROR quando expira em ≤ 7 dias', async () => {
    const { useCase, notifRepo } = setup([makeCert(3)]);
    const r = await useCase.execute();
    expect(r.notified).toBe(1);
    const args = (notifRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.category).toBe('certificate.expiring.urgent');
    expect(args.severity).toBe('error');
  });

  it('classifica como WARN quando expira em ≤ 30 dias', async () => {
    const { useCase, notifRepo } = setup([makeCert(25)]);
    await useCase.execute();
    const args = (notifRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.category).toBe('certificate.expiring.soon');
    expect(args.severity).toBe('warn');
  });

  it('classifica como INFO quando expira entre 31 e 60 dias', async () => {
    const { useCase, notifRepo } = setup([makeCert(45)]);
    await useCase.execute();
    const args = (notifRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.category).toBe('certificate.expiring.heads-up');
    expect(args.severity).toBe('info');
  });

  it('lista vazia produz 0 notificações', async () => {
    const { useCase, notifRepo } = setup([]);
    const r = await useCase.execute();
    expect(r.examined).toBe(0);
    expect(r.notified).toBe(0);
    expect(notifRepo.create).not.toHaveBeenCalled();
  });

  it('múltiplos certs gera múltiplas notificações independentes', async () => {
    const { useCase, notifRepo } = setup([
      makeCert(3, 'c-A', 'A'),
      makeCert(20, 'c-B', 'B'),
      makeCert(50, 'c-C', 'C'),
    ]);
    const r = await useCase.execute();
    expect(r.examined).toBe(3);
    expect(r.notified).toBe(3);
    expect(notifRepo.create).toHaveBeenCalledTimes(3);
  });
});

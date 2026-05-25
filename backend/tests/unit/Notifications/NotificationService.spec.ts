import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Notification, NotificationSeverity } from '@modules/Notifications/infra/typeorm/entities/Notification';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';

function makeRepo(): INotificationRepository {
  return {
    create: vi.fn(async (data) => ({ id: 'notif-1', ...data }) as unknown as Notification),
    list: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  };
}

describe('NotificationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('atalhos info/warn/error definem severity correto', async () => {
    const repo = makeRepo();
    const service = new NotificationService(repo);

    await service.info({
      companyId: 'c-1',
      userId: 'u-1',
      category: 'manifest_pending',
      title: 'Nota pendente',
      message: 'Você tem 1 nota pendente.',
    });
    await service.warn({
      companyId: 'c-1',
      category: 'cert_expiry',
      title: 'Certificado a expirar',
      message: 'Em 7 dias.',
    });
    await service.error({
      companyId: 'c-1',
      category: 'rejection',
      title: 'NF-e rejeitada',
      message: 'cStat 215',
    });

    const calls = (repo.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].severity).toBe(NotificationSeverity.INFO);
    expect(calls[1][0].severity).toBe(NotificationSeverity.WARN);
    expect(calls[2][0].severity).toBe(NotificationSeverity.ERROR);
  });

  it('falha no repositório degrada graciosamente (retorna null)', async () => {
    const repo: INotificationRepository = {
      create: vi.fn().mockRejectedValue(new Error('DB down')),
      list: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    };
    const service = new NotificationService(repo);

    const result = await service.notify({
      companyId: 'c-1',
      category: 'rejection',
      title: 't',
      message: 'm',
    });
    expect(result).toBeNull();
  });
});

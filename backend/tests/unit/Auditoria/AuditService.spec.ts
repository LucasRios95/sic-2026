import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '@modules/Auditoria/AuditService';
import { AuditLog } from '@modules/Auditoria/infra/typeorm/entities/AuditLog';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import { runWithRequestContext } from '@shared/context/request-context';

function makeRepo(): IAuditLogRepository {
  return {
    create: vi.fn(async (data) => ({ id: 'log-1', occurredAt: new Date(), ...data }) as AuditLog),
    list: vi.fn(),
  };
}

describe('AuditService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grava com campos mínimos', async () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    await service.record({ action: 'nfe.emit', entityType: 'nfe', entityId: 'nfe-1' });

    const call = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.action).toBe('nfe.emit');
    expect(call.entityType).toBe('nfe');
    expect(call.entityId).toBe('nfe-1');
  });

  it('enriquece userId/companyId/requestId do AsyncLocalStorage', async () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    await runWithRequestContext(
      { requestId: 'req-42', userId: 'user-7', companyId: 'company-9', tenantId: 'tenant-1' },
      async () => {
        await service.record({ action: 'company.update', entityType: 'company' });
      },
    );

    const call = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.requestId).toBe('req-42');
    expect(call.userId).toBe('user-7');
    expect(call.companyId).toBe('company-9');
  });

  it('input explícito tem prioridade sobre contexto', async () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    await runWithRequestContext({ requestId: 'req-ctx', userId: 'user-ctx' }, async () => {
      await service.record({
        action: 'admin.impersonate',
        entityType: 'user',
        userId: 'user-explicit',
      });
    });

    const call = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.userId).toBe('user-explicit');
  });

  it('degrada graciosamente quando o repositório falha', async () => {
    const repo: IAuditLogRepository = {
      create: vi.fn().mockRejectedValue(new Error('DB down')),
      list: vi.fn(),
    };
    const service = new AuditService(repo);

    // Não deve lançar — apenas loga warning internamente.
    await expect(
      service.record({ action: 'auth.login', entityType: 'user' }),
    ).resolves.toBeUndefined();
  });
});

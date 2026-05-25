import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '@modules/Auditoria/AuditService';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import {
  AmbienteSefaz,
  CodigoRegimeTributario,
  Company,
} from '@modules/Companies/infra/typeorm/entities/Company';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { DocumentStatus } from '@modules/NFe/domain/nfe-enums';
import { NFe } from '@modules/NFe/infra/typeorm/entities/NFe';
import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';
import { INFeRepository } from '@modules/NFe/repositories/INFeRepository';
import { ReconcileNFeUseCase } from '@modules/NFe/useCases/ReconcileNFe/ReconcileNFeUseCase';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';

function nfeProcessing(): NFe {
  return {
    id: 'nfe-1',
    companyId: 'company-1',
    numero: '42',
    chaveAcesso: '35260611222333000181550010000000011000000017',
    status: DocumentStatus.PROCESSING,
    ambiente: AmbienteSefaz.HOMOLOGACAO,
  } as unknown as NFe;
}

function setup(soapResponse: Partial<Awaited<ReturnType<SefazSoapClient['call']>>>, initial = nfeProcessing()) {
  const nfeRepo: INFeRepository = {
    findByIdempotencyKey: vi.fn(),
    findById: vi.fn(),
    findByIdAny: vi.fn(async () => initial),
    findByIdWithRelations: vi.fn(),
    listStaleProcessing: vi.fn(),
    createAggregate: vi.fn(),
    update: vi.fn(async (_id, p) => ({ ...initial, ...p } as NFe)),
    list: vi.fn(),
  };
  const companyRepo: ICompanyRepository = {
    create: vi.fn(),
    findById: vi.fn(
      async () =>
        ({
          id: 'company-1',
          uf: 'SP',
          ambienteSefaz: AmbienteSefaz.HOMOLOGACAO,
          crt: CodigoRegimeTributario.REGIME_NORMAL,
        }) as Company,
    ),
    findByCnpj: vi.fn(),
    findByIds: vi.fn(),
    listByTenant: vi.fn(),
  };
  const soap = {
    call: vi.fn(async () => ({
      cStat: '105',
      xMotivo: 'Em processamento',
      responseXml: '',
      durationMs: 80,
      httpStatus: 200,
      endpointUrl: 'https://t',
      ...soapResponse,
    })),
  } as unknown as SefazSoapClient;
  const audit = new AuditService({ create: vi.fn(), list: vi.fn() } as unknown as IAuditLogRepository);
  const notifications = new NotificationService({
    create: vi.fn(),
    list: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  } as unknown as INotificationRepository);

  const useCase = new ReconcileNFeUseCase(nfeRepo, companyRepo, soap, audit, notifications);
  return { useCase, nfeRepo, soap };
}

describe('ReconcileNFeUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cStat 100: marca AUTHORIZED + protocolo + dhAutorizacao', async () => {
    const { useCase, nfeRepo } = setup({
      cStat: '100',
      xMotivo: 'Autorizado',
      responseXml: '<retConsSitNFe><nProt>12345</nProt></retConsSitNFe>',
    });
    const result = await useCase.execute({
      nfeId: 'nfe-1',
      certificateVaultRef: 'mem:c1',
    });
    expect(result.resolved).toBe(true);
    expect(result.nfe.status).toBe(DocumentStatus.AUTHORIZED);
    expect(nfeRepo.update).toHaveBeenCalledWith(
      'nfe-1',
      expect.objectContaining({
        status: DocumentStatus.AUTHORIZED,
        protocoloAutorizacao: '12345',
      }),
    );
  });

  it('cStat 105: mantém PROCESSING sem update', async () => {
    const { useCase, nfeRepo } = setup({ cStat: '105', xMotivo: 'Em processamento' });
    const result = await useCase.execute({ nfeId: 'nfe-1', certificateVaultRef: 'm:c' });
    expect(result.resolved).toBe(false);
    expect(nfeRepo.update).not.toHaveBeenCalled();
  });

  it('cStat 217 (não consta): mantém PROCESSING para nova tentativa', async () => {
    const { useCase, nfeRepo } = setup({ cStat: '217', xMotivo: 'Não consta' });
    const result = await useCase.execute({ nfeId: 'nfe-1', certificateVaultRef: 'm:c' });
    expect(result.resolved).toBe(false);
    expect(nfeRepo.update).not.toHaveBeenCalled();
  });

  it('cStat 110 (denegada): marca DENIED', async () => {
    const { useCase } = setup({ cStat: '110', xMotivo: 'Uso denegado' });
    const result = await useCase.execute({ nfeId: 'nfe-1', certificateVaultRef: 'm:c' });
    expect(result.nfe.status).toBe(DocumentStatus.DENIED);
  });

  it('cStat 539 (rejeitada genérica): marca REJECTED', async () => {
    const { useCase } = setup({ cStat: '539', xMotivo: 'Duplicidade' });
    const result = await useCase.execute({ nfeId: 'nfe-1', certificateVaultRef: 'm:c' });
    expect(result.nfe.status).toBe(DocumentStatus.REJECTED);
  });

  it('NFe já saiu de PROCESSING: short-circuit sem chamar SEFAZ', async () => {
    const already = { ...nfeProcessing(), status: DocumentStatus.AUTHORIZED } as NFe;
    const { useCase, soap } = setup({}, already);
    const result = await useCase.execute({ nfeId: 'nfe-1', certificateVaultRef: 'm:c' });
    expect(result.resolved).toBe(true);
    expect(soap.call).not.toHaveBeenCalled();
  });

  it('NFe sem chaveAcesso: não reconcilia (warning + resolved=false)', async () => {
    const noChave = { ...nfeProcessing(), chaveAcesso: null } as NFe;
    const { useCase, soap } = setup({}, noChave);
    const result = await useCase.execute({ nfeId: 'nfe-1', certificateVaultRef: 'm:c' });
    expect(result.resolved).toBe(false);
    expect(soap.call).not.toHaveBeenCalled();
  });
});

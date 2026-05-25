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
import { NFeEvento } from '@modules/NFe/infra/typeorm/entities/NFeEvento';
import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';
import { NFeSigner } from '@modules/NFe/infra/signing/NFeSigner';
import { INFeEventoRepository } from '@modules/NFe/repositories/INFeEventoRepository';
import { INFeRepository } from '@modules/NFe/repositories/INFeRepository';
import { CancelarNFeUseCase } from '@modules/NFe/useCases/CancelarNFe/CancelarNFeUseCase';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';
import {
  ICertificateVault,
  RetrievedCertificate,
} from '@shared/container/providers/CertificateVault/ICertificateVault';
import {
  AccountLockedError,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@shared/errors';

// AccountLockedError importado só para silenciar warning; não é usado diretamente neste spec.
void AccountLockedError;

function makeCompany(): Company {
  return {
    id: 'company-1',
    cnpj: '11222333000181',
    uf: 'SP',
    ambienteSefaz: AmbienteSefaz.HOMOLOGACAO,
    crt: CodigoRegimeTributario.REGIME_NORMAL,
  } as Company;
}

function makeNFeAuthorized(hoursAgoAuthorized: number): NFe {
  const dh = new Date(Date.now() - hoursAgoAuthorized * 3600_000);
  return {
    id: 'nfe-1',
    companyId: 'company-1',
    numero: '1',
    chaveAcesso: '35260611222333000181550010000000011000000017',
    protocoloAutorizacao: '135260012345678',
    dhAutorizacao: dh,
    status: DocumentStatus.AUTHORIZED,
    ambiente: AmbienteSefaz.HOMOLOGACAO,
  } as unknown as NFe;
}

function setup(initialNFe: NFe) {
  const nfeRepo: INFeRepository = {
    findByIdempotencyKey: vi.fn(),
    findById: vi.fn(async () => initialNFe),
    findByIdWithRelations: vi.fn(),
    createAggregate: vi.fn(),
    update: vi.fn(async (_id, patch) => ({ ...initialNFe, ...patch } as NFe)),
    list: vi.fn(),
  };
  const eventoRepo: INFeEventoRepository = {
    create: vi.fn(async (data) => ({ id: 'evt-1', ...data } as NFeEvento)),
    update: vi.fn(async (id, patch) => ({ id, ...patch } as NFeEvento)),
    countByTipo: vi.fn(async () => 0),
    listByNFe: vi.fn(),
  };
  const companyRepo: ICompanyRepository = {
    create: vi.fn(),
    findById: vi.fn(async () => makeCompany()),
    findByCnpj: vi.fn(),
    findByIds: vi.fn(),
    listByTenant: vi.fn(),
  };
  const signer = {
    sign: vi.fn(() => '<signed-xml/>'),
    verify: vi.fn(() => true),
  } as unknown as NFeSigner;
  const soap = {
    call: vi.fn(async () => ({
      cStat: '135',
      xMotivo: 'Evento registrado e vinculado a NF-e',
      responseXml: '<retEvento><nProt>987654321</nProt></retEvento>',
      durationMs: 100,
      httpStatus: 200,
      endpointUrl: 'https://test',
    })),
  } as unknown as SefazSoapClient;
  const vault: ICertificateVault = {
    store: vi.fn(),
    retrieve: vi.fn(
      async () =>
        ({
          metadata: { alias: 't' },
          content: Buffer.from(''),
          password: 'p',
        } as unknown as RetrievedCertificate),
    ),
    revoke: vi.fn(),
    list: vi.fn(),
  };
  const auditRepo: IAuditLogRepository = {
    create: vi.fn(),
    list: vi.fn(),
  };
  const notifRepo: INotificationRepository = {
    create: vi.fn(),
    list: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  };
  const audit = new AuditService(auditRepo);
  const notifications = new NotificationService(notifRepo);

  const useCase = new CancelarNFeUseCase(
    nfeRepo,
    eventoRepo,
    companyRepo,
    signer,
    soap,
    vault,
    audit,
    notifications,
  );
  return { useCase, nfeRepo, eventoRepo, signer, soap };
}

const baseRequest = {
  companyId: 'company-1',
  nfeId: 'nfe-1',
  userId: 'user-1',
  certificateVaultRef: 'mem:cert-1',
  justificativa: 'Cancelamento dentro do prazo por erro de digitação',
};

describe('CancelarNFeUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancela com sucesso dentro do prazo (cStat 135)', async () => {
    const { useCase, nfeRepo, eventoRepo, soap } = setup(makeNFeAuthorized(2));
    const result = await useCase.execute(baseRequest);

    expect(result.cStat).toBe('135');
    expect(result.nfe.status).toBe(DocumentStatus.CANCELLED);
    expect(soap.call).toHaveBeenCalledOnce();
    expect(eventoRepo.create).toHaveBeenCalledOnce();
    expect(nfeRepo.update).toHaveBeenCalled();
  });

  it('rejeita fora do prazo (>24h)', async () => {
    const { useCase } = setup(makeNFeAuthorized(25));
    await expect(useCase.execute(baseRequest)).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(useCase.execute(baseRequest)).rejects.toMatchObject({
      code: 'NFE_CANCELLATION_DEADLINE_EXCEEDED',
    });
  });

  it('rejeita justificativa curta (<15 chars) sem chamar SEFAZ', async () => {
    const { useCase, soap } = setup(makeNFeAuthorized(1));
    await expect(
      useCase.execute({ ...baseRequest, justificativa: 'curta' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(soap.call).not.toHaveBeenCalled();
  });

  it('rejeita NFe em status diferente de AUTHORIZED', async () => {
    const nfe = makeNFeAuthorized(1);
    nfe.status = DocumentStatus.REJECTED;
    const { useCase } = setup(nfe);
    await expect(useCase.execute(baseRequest)).rejects.toMatchObject({
      code: 'NFE_NOT_CANCELLABLE',
    });
  });

  it('rejeita NFe sem chaveAcesso/protocolo (inconsistente)', async () => {
    const nfe = makeNFeAuthorized(1);
    nfe.protocoloAutorizacao = null;
    const { useCase } = setup(nfe);
    await expect(useCase.execute(baseRequest)).rejects.toMatchObject({
      code: 'NFE_MISSING_AUTH_DATA',
    });
  });

  it('rejeita NFe inexistente', async () => {
    const { useCase, nfeRepo } = setup(makeNFeAuthorized(1));
    (nfeRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(useCase.execute(baseRequest)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cStat não-aceito mantém NFe em AUTHORIZED (não cancela)', async () => {
    const { useCase, soap, nfeRepo } = setup(makeNFeAuthorized(1));
    (soap.call as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      cStat: '215', // "Falha no schema XML"
      xMotivo: 'Falha no schema',
      responseXml: '<x/>',
      durationMs: 50,
      httpStatus: 200,
      endpointUrl: 'https://test',
    });
    const result = await useCase.execute(baseRequest);
    expect(result.cStat).toBe('215');
    // O use case retorna o objeto original sem atualizar status (não chamou update para CANCELLED)
    expect(nfeRepo.update).not.toHaveBeenCalled();
  });
});

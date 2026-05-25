import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '@modules/Auditoria/AuditService';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import {
  AmbienteSefaz,
  CodigoRegimeTributario,
  Company,
} from '@modules/Companies/infra/typeorm/entities/Company';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { DocumentStatus, TipoEventoNFe } from '@modules/NFe/domain/nfe-enums';
import { NFe } from '@modules/NFe/infra/typeorm/entities/NFe';
import { NFeEvento } from '@modules/NFe/infra/typeorm/entities/NFeEvento';
import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';
import { NFeSigner } from '@modules/NFe/infra/signing/NFeSigner';
import { INFeEventoRepository } from '@modules/NFe/repositories/INFeEventoRepository';
import { INFeRepository } from '@modules/NFe/repositories/INFeRepository';
import { EmitirCceUseCase } from '@modules/NFe/useCases/EmitirCce/EmitirCceUseCase';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';
import {
  ICertificateVault,
  RetrievedCertificate,
} from '@shared/container/providers/CertificateVault/ICertificateVault';
import { BusinessRuleError, ValidationError } from '@shared/errors';

function makeCompany(): Company {
  return {
    id: 'company-1',
    cnpj: '11222333000181',
    uf: 'SP',
    ambienteSefaz: AmbienteSefaz.HOMOLOGACAO,
    crt: CodigoRegimeTributario.REGIME_NORMAL,
  } as Company;
}

function makeNFe(): NFe {
  return {
    id: 'nfe-1',
    companyId: 'company-1',
    numero: '1',
    chaveAcesso: '35260611222333000181550010000000011000000017',
    status: DocumentStatus.AUTHORIZED,
    ambiente: AmbienteSefaz.HOMOLOGACAO,
  } as unknown as NFe;
}

function setup(currentCount = 0) {
  const nfe = makeNFe();
  const nfeRepo: INFeRepository = {
    findByIdempotencyKey: vi.fn(),
    findById: vi.fn(async () => nfe),
    findByIdAny: vi.fn(),
    findByIdWithRelations: vi.fn(),
    listStaleProcessing: vi.fn(),
    createAggregate: vi.fn(),
    update: vi.fn(async (_id, p) => ({ ...nfe, ...p } as NFe)),
    list: vi.fn(),
  };
  const eventoRepo: INFeEventoRepository = {
    create: vi.fn(async (d) => ({ id: 'evt-1', ...d } as unknown as NFeEvento)),
    update: vi.fn(async (id, p) => ({ id, ...p } as unknown as NFeEvento)),
    countByTipo: vi.fn(async () => currentCount),
    listByNFe: vi.fn(),
  };
  const companyRepo: ICompanyRepository = {
    create: vi.fn(),
    findById: vi.fn(async () => makeCompany()),
    findByCnpj: vi.fn(),
    findByIds: vi.fn(),
    listByTenant: vi.fn(),
  };
  const signer = { sign: vi.fn(() => '<signed/>'), verify: vi.fn() } as unknown as NFeSigner;
  const soap = {
    call: vi.fn(async () => ({
      cStat: '135',
      xMotivo: 'Evento registrado',
      responseXml: '<retEvento><nProt>999</nProt></retEvento>',
      durationMs: 50,
      httpStatus: 200,
      endpointUrl: 'https://t',
    })),
  } as unknown as SefazSoapClient;
  const vault: ICertificateVault = {
    store: vi.fn(),
    retrieve: vi.fn(
      async () =>
        ({ metadata: { alias: 't' }, content: Buffer.from(''), password: '' }) as unknown as RetrievedCertificate,
    ),
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

  const useCase = new EmitirCceUseCase(
    nfeRepo,
    eventoRepo,
    companyRepo,
    signer,
    soap,
    vault,
    audit,
    notifications,
  );
  return { useCase, eventoRepo, soap, nfeRepo };
}

const baseRequest = {
  companyId: 'company-1',
  nfeId: 'nfe-1',
  userId: 'user-1',
  certificateVaultRef: 'mem:c1',
  correcao: 'Corrigir nome da transportadora informado por engano',
};

describe('EmitirCceUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emite CC-e com sequencial 1 quando não há CC-e prévia', async () => {
    const { useCase, eventoRepo, soap } = setup(0);
    const result = await useCase.execute(baseRequest);

    expect(result.sequencial).toBe(1);
    expect(result.cStat).toBe('135');
    expect(eventoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: TipoEventoNFe.CARTA_CORRECAO, sequencial: 1 }),
    );
    expect(soap.call).toHaveBeenCalledOnce();
  });

  it('incrementa sequencial conforme CC-e existentes (até 20)', async () => {
    const { useCase, eventoRepo } = setup(5);
    const result = await useCase.execute(baseRequest);
    expect(result.sequencial).toBe(6);
    expect(eventoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sequencial: 6 }),
    );
  });

  it('rejeita ao atingir limite de 20 CC-e (MOC)', async () => {
    const { useCase, soap } = setup(20);
    await expect(useCase.execute(baseRequest)).rejects.toMatchObject({
      code: 'CCE_LIMIT_REACHED',
    });
    expect(soap.call).not.toHaveBeenCalled();
  });

  it('rejeita correção com menos de 15 caracteres', async () => {
    const { useCase, soap } = setup(0);
    await expect(
      useCase.execute({ ...baseRequest, correcao: 'curto' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(soap.call).not.toHaveBeenCalled();
  });

  it('rejeita correção acima de 1000 caracteres (limite MOC)', async () => {
    const { useCase } = setup(0);
    await expect(
      useCase.execute({ ...baseRequest, correcao: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejeita NF-e em status diferente de AUTHORIZED', async () => {
    const { useCase, nfeRepo } = setup(0);
    (nfeRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...makeNFe(),
      status: DocumentStatus.REJECTED,
    });
    await expect(useCase.execute(baseRequest)).rejects.toMatchObject({
      code: 'NFE_NOT_AUTHORIZED_FOR_CCE',
    });
  });

  it('mantém evento REJECTED quando cStat não é 135/136', async () => {
    const { useCase, eventoRepo, soap } = setup(0);
    (soap.call as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      cStat: '215',
      xMotivo: 'Falha no schema',
      responseXml: '<x/>',
      durationMs: 40,
      httpStatus: 200,
      endpointUrl: 'https://t',
    });
    const result = await useCase.execute(baseRequest);
    expect(result.cStat).toBe('215');
    expect(eventoRepo.update).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ status: DocumentStatus.REJECTED }),
    );
  });

  // Suprime warning de BusinessRuleError importado por symmetry com outros specs.
  void BusinessRuleError;
});

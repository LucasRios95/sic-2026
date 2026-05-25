import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '@modules/Auditoria/AuditService';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import { Customer } from '@modules/Customers/infra/typeorm/entities/Customer';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { DocumentStatus } from '@modules/NFe/domain/nfe-enums';
import { NFe } from '@modules/NFe/infra/typeorm/entities/NFe';
import { INFeRepository } from '@modules/NFe/repositories/INFeRepository';
import { GenerateDanfeUseCase } from '@modules/NFe/useCases/GenerateDanfe/GenerateDanfeUseCase';
import { SendNFeByEmailUseCase } from '@modules/NFe/useCases/SendNFeByEmail/SendNFeByEmailUseCase';
import { IDocumentStorage } from '@shared/container/providers/DocumentStorage/IDocumentStorage';
import { IMailProvider } from '@shared/container/providers/MailProvider/IMailProvider';
import { BusinessRuleError, ValidationError } from '@shared/errors';

function makeNFe(): NFe {
  return {
    id: 'nfe-1',
    companyId: 'c-1',
    customerId: 'cust-1',
    numero: '42',
    serie: 1,
    chaveAcesso: '35260611222333000181550010000000011000000017',
    status: DocumentStatus.AUTHORIZED,
    ambiente: AmbienteSefaz.HOMOLOGACAO,
    protocoloAutorizacao: '999',
    xmlAutorizado: '<NFeProc/>',
  } as unknown as NFe;
}

function setup(opts: { customerEmail?: string | null } = {}) {
  const nfe = makeNFe();
  const nfeRepo: INFeRepository = {
    findByIdempotencyKey: vi.fn(),
    findById: vi.fn(async () => nfe),
    findByIdAny: vi.fn(),
    findByIdWithRelations: vi.fn(),
    listStaleProcessing: vi.fn(),
    createAggregate: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
  };
  const customerRepo: ICustomerRepository = {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(async () => ({
      id: 'cust-1',
      email: opts.customerEmail === undefined ? 'cliente@example.com' : opts.customerEmail,
    } as unknown as Customer)),
    findByCnpjCpf: vi.fn(),
    list: vi.fn(),
    softDelete: vi.fn(),
  };
  const storage: IDocumentStorage = {
    put: vi.fn(),
    get: vi.fn(async () => Buffer.from('pdf-bytes')),
    remove: vi.fn(),
    exists: vi.fn(async () => true),
    getSignedUrl: vi.fn(async () => '/storage/token'),
  };
  const mailer = {
    send: vi.fn(async () => ({ messageId: 'mid-1' })),
  } as unknown as IMailProvider;
  const generateDanfe = {
    execute: vi.fn(async () => ({
      storageKey: 'nfe/c-1/2026/06/35260611222333000181550010000000011000000017.pdf',
      signedUrl: '/storage/token',
      bytes: 12,
      regenerated: false,
    })),
  } as unknown as GenerateDanfeUseCase;
  const audit = new AuditService({ create: vi.fn(), list: vi.fn() } as unknown as IAuditLogRepository);

  const useCase = new SendNFeByEmailUseCase(
    nfeRepo,
    customerRepo,
    storage,
    mailer,
    generateDanfe,
    audit,
  );
  return { useCase, nfeRepo, customerRepo, mailer, generateDanfe };
}

const baseRequest = {
  companyId: 'c-1',
  nfeId: 'nfe-1',
  userId: 'user-1',
};

describe('SendNFeByEmailUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envia para o e-mail do cliente quando `to` não é informado', async () => {
    const { useCase, mailer } = setup();
    const result = await useCase.execute(baseRequest);
    expect(result.to).toBe('cliente@example.com');
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'cliente@example.com' }),
    );
  });

  it('anexa PDF + XML quando ambos disponíveis', async () => {
    const { useCase, mailer } = setup();
    await useCase.execute(baseRequest);
    const sent = (mailer.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.attachments).toHaveLength(2);
    expect(sent.attachments.find((a: { contentType: string }) => a.contentType === 'application/pdf')).toBeTruthy();
    expect(sent.attachments.find((a: { contentType: string }) => a.contentType === 'application/xml')).toBeTruthy();
  });

  it('aceita `to` explícito sobrescrevendo o cliente', async () => {
    const { useCase, mailer } = setup({ customerEmail: 'cliente@example.com' });
    await useCase.execute({ ...baseRequest, to: 'gerente@example.com' });
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'gerente@example.com' }),
    );
  });

  it('rejeita `to` mal formado', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({ ...baseRequest, to: 'nao-eh-email' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('recusa quando cliente não tem e-mail e `to` não foi informado', async () => {
    const { useCase } = setup({ customerEmail: null });
    await expect(useCase.execute(baseRequest)).rejects.toMatchObject({
      code: 'CUSTOMER_EMAIL_MISSING',
    });
  });

  it('recusa NF-e em status != AUTHORIZED', async () => {
    const { useCase, nfeRepo } = setup();
    (nfeRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...makeNFe(),
      status: DocumentStatus.REJECTED,
    });
    await expect(useCase.execute(baseRequest)).rejects.toMatchObject({
      code: 'NFE_NOT_AUTHORIZED_FOR_EMAIL',
    });
  });

  // Suprime warning de import simbólico
  void BusinessRuleError;
});

import { describe, expect, it, vi } from 'vitest';

import { AuditService } from '@modules/Auditoria/AuditService';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { NFe } from '@modules/NFe/infra/typeorm/entities/NFe';
import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';
import { NFeSigner } from '@modules/NFe/infra/signing/NFeSigner';
import { INFeRepository } from '@modules/NFe/repositories/INFeRepository';
import { INumberingSeriesRepository } from '@modules/NFe/repositories/INumberingSeriesRepository';
import { EmitirNFeUseCase } from '@modules/NFe/useCases/EmitirNFe/EmitirNFeUseCase';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';
import { IProductRepository } from '@modules/Products/repositories/IProductRepository';
import { IProductTaxRuleRepository } from '@modules/Products/repositories/IProductTaxRuleRepository';
import { MotorTributario } from '@modules/TaxEngine/MotorTributario';
import { ICertificateVault } from '@shared/container/providers/CertificateVault/ICertificateVault';

/**
 * Teste focado em idempotência: o use case detecta chave repetida e retorna a NF-e
 * existente SEM consumir número novo nem chamar SEFAZ. Esse é o caso típico de
 * "faturista deu refresh no navegador" — não pode consumir 2 números pra mesma intenção.
 */
describe('EmitirNFeUseCase — idempotência', () => {
  it('retorna NF-e existente quando idempotencyKey já foi usada', async () => {
    const existing = {
      id: 'nfe-existing',
      idempotencyKey: 'cli-req-abc',
      companyId: 'company-1',
    } as NFe;

    const nfeRepo: INFeRepository = {
      findByIdempotencyKey: vi.fn(async (k) => (k === 'cli-req-abc' ? existing : null)),
      findById: vi.fn(),
      findByIdWithRelations: vi.fn(),
      createAggregate: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
    };
    const numberingRepo: INumberingSeriesRepository = {
      ensureSeries: vi.fn(),
      allocateNumber: vi.fn(),
    };

    // Demais dependências NÃO devem ser chamadas porque o caminho de idempotência
    // sai cedo. Setamos mocks "explosivos" — qualquer chamada = teste falha.
    const explode = (name: string) =>
      vi.fn(() => {
        throw new Error(`${name} não deveria ter sido chamado no caminho idempotente`);
      });
    const companyRepo = {
      findById: explode('CompanyRepository.findById'),
    } as unknown as ICompanyRepository;
    const customerRepo = {
      findById: explode('CustomerRepository.findById'),
    } as unknown as ICustomerRepository;
    const productRepo = { findById: explode('Product') } as unknown as IProductRepository;
    const taxRuleRepo = {
      findActiveAt: explode('ProductTaxRule'),
    } as unknown as IProductTaxRuleRepository;
    const motor = {
      calcular: explode('MotorTributario'),
    } as unknown as MotorTributario;
    const signer = { sign: explode('Signer'), verify: vi.fn() } as unknown as NFeSigner;
    const soap = { call: explode('SoapClient') } as unknown as SefazSoapClient;
    const vault = { retrieve: explode('Vault.retrieve') } as unknown as ICertificateVault;
    const audit = new AuditService({ create: explode('AuditLog'), list: vi.fn() } as unknown as IAuditLogRepository);
    const notifications = new NotificationService({
      create: explode('Notification'),
      list: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    } as unknown as INotificationRepository);

    const useCase = new EmitirNFeUseCase(
      nfeRepo,
      numberingRepo,
      companyRepo,
      customerRepo,
      productRepo,
      taxRuleRepo,
      motor,
      signer,
      soap,
      vault,
      audit,
      notifications,
    );

    const result = await useCase.execute({
      idempotencyKey: 'cli-req-abc',
      companyId: 'company-1',
      customerId: 'customer-1',
      serie: 1,
      naturezaOperacao: 'Venda',
      itens: [
        {
          numeroItem: 1,
          productId: 'p-1',
          cfop: '5102',
          unidadeComercial: 'UN',
          quantidade: '1',
          valorUnitario: '100',
        },
      ],
      pagamentos: [{ meio: '01', valor: '100' }],
    });

    expect(result.alreadyEmitted).toBe(true);
    expect(result.nfe.id).toBe('nfe-existing');
    // Nenhuma reserva de número aconteceu — invariante essencial.
    expect(numberingRepo.allocateNumber).not.toHaveBeenCalled();
    expect(numberingRepo.ensureSeries).not.toHaveBeenCalled();
  });
});

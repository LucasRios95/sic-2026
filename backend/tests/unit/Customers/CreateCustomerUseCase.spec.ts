import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { Customer } from '@modules/Customers/infra/typeorm/entities/Customer';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { CreateCustomerUseCase } from '@modules/Customers/useCases/CreateCustomer/CreateCustomerUseCase';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';
import { IndicadorIE, TipoPessoa } from '@shared/types/fiscal-enums';

interface Setup {
  useCase: CreateCustomerUseCase;
  customerRepo: ICustomerRepository;
  companyRepo: ICompanyRepository;
}

function setup(): Setup {
  const company = { id: 'company-1' } as Company;
  const companyRepo: ICompanyRepository = {
    create: vi.fn(),
    findById: vi.fn(async (id) => (id === 'company-1' ? company : null)),
    findByCnpj: vi.fn(),
    findByIds: vi.fn(),
    listByTenant: vi.fn(),
  };
  const customerRepo: ICustomerRepository = {
    create: vi.fn(async (data) => ({ id: 'cust-1', ...data }) as unknown as Customer),
    update: vi.fn(),
    findById: vi.fn(),
    findByCnpjCpf: vi.fn(async () => null),
    list: vi.fn(),
    softDelete: vi.fn(),
  };

  const useCase = new CreateCustomerUseCase(customerRepo, companyRepo);
  return { useCase, customerRepo, companyRepo };
}

function basePjPayload() {
  return {
    companyId: 'company-1',
    tipoPessoa: TipoPessoa.PJ,
    cnpjCpf: '11.222.333/0001-81', // CNPJ válido
    nomeRazao: 'Cliente PJ',
    indicadorIE: IndicadorIE.CONTRIBUINTE,
    logradouro: 'Rua A',
    numero: '100',
    bairro: 'Centro',
    codigoMunicipioIbge: '3550308',
    municipio: 'São Paulo',
    uf: 'SP',
    cep: '01001000',
  };
}

describe('CreateCustomerUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria cliente PJ válido e normaliza o CNPJ', async () => {
    const { useCase, customerRepo } = setup();

    const result = await useCase.execute(basePjPayload());

    expect(result.id).toBe('cust-1');
    const passed = (customerRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passed.cnpjCpf).toBe('11222333000181');
  });

  it('rejeita CNPJ inválido para PJ', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({ ...basePjPayload(), cnpjCpf: '11222333000100' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejeita CPF inválido para PF', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        ...basePjPayload(),
        tipoPessoa: TipoPessoa.PF,
        cnpjCpf: '12345678900',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('aceita identificador opaco para tipoPessoa ESTRANGEIRO', async () => {
    const { useCase, customerRepo } = setup();
    const r = await useCase.execute({
      ...basePjPayload(),
      tipoPessoa: TipoPessoa.ESTRANGEIRO,
      cnpjCpf: 'EXT-9999999',
    });
    expect(r.id).toBe('cust-1');
    const passed = (customerRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passed.cnpjCpf).toBe('EXT-9999999'); // não normaliza
  });

  it('rejeita CNPJ duplicado na mesma empresa', async () => {
    const { useCase, customerRepo } = setup();
    (customerRepo.findByCnpjCpf as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'other',
    } as Customer);

    await expect(useCase.execute(basePjPayload())).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejeita quando empresa não existe', async () => {
    const { useCase, companyRepo } = setup();
    (companyRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(useCase.execute(basePjPayload())).rejects.toBeInstanceOf(NotFoundError);
  });
});

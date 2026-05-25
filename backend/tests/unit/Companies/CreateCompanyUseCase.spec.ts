import { describe, expect, it, vi } from 'vitest';

import { Company, CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { CreateCompanyUseCase, isValidCnpj } from '@modules/Companies/useCases/CreateCompany/CreateCompanyUseCase';
import { ITenantRepository } from '@modules/Tenants/repositories/ITenantRepository';
import { Tenant } from '@modules/Tenants/infra/typeorm/entities/Tenant';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

function buildValidPayload(overrides: Partial<Parameters<CreateCompanyUseCase['execute']>[0]> = {}) {
  return {
    tenantId: 'tenant-1',
    cnpj: '11222333000181', // CNPJ válido (DV calculado)
    razaoSocial: 'Empresa Teste LTDA',
    crt: CodigoRegimeTributario.REGIME_NORMAL,
    logradouro: 'Rua A',
    numero: '100',
    bairro: 'Centro',
    codigoMunicipioIbge: '3550308',
    municipio: 'São Paulo',
    uf: 'SP',
    cep: '01001000',
    ...overrides,
  };
}

function makeRepositories(): {
  tenantRepo: ITenantRepository;
  companyRepo: ICompanyRepository;
} {
  const tenant = { id: 'tenant-1', name: 'T', slug: 't', active: true } as Tenant;
  const tenantRepo: ITenantRepository = {
    create: vi.fn(),
    findById: vi.fn(async (id) => (id === 'tenant-1' ? tenant : null)),
    findBySlug: vi.fn(),
  };
  const companyRepo: ICompanyRepository = {
    create: vi.fn(async (data) => ({ id: 'company-1', ...data }) as unknown as Company),
    findById: vi.fn(),
    findByCnpj: vi.fn(async () => null),
    findByIds: vi.fn(),
    listByTenant: vi.fn(),
  };
  return { tenantRepo, companyRepo };
}

describe('CreateCompanyUseCase', () => {
  it('cria uma empresa com payload válido', async () => {
    const { tenantRepo, companyRepo } = makeRepositories();
    const useCase = new CreateCompanyUseCase(companyRepo, tenantRepo);

    const result = await useCase.execute(buildValidPayload());

    expect(result.id).toBe('company-1');
    expect(companyRepo.create).toHaveBeenCalledOnce();
  });

  it('rejeita CNPJ inválido com ValidationError', async () => {
    const { tenantRepo, companyRepo } = makeRepositories();
    const useCase = new CreateCompanyUseCase(companyRepo, tenantRepo);

    await expect(useCase.execute(buildValidPayload({ cnpj: '12345678000100' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(companyRepo.create).not.toHaveBeenCalled();
  });

  it('rejeita quando o tenant não existe', async () => {
    const { tenantRepo, companyRepo } = makeRepositories();
    (tenantRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const useCase = new CreateCompanyUseCase(companyRepo, tenantRepo);

    await expect(useCase.execute(buildValidPayload())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejeita CNPJ duplicado no tenant', async () => {
    const { tenantRepo, companyRepo } = makeRepositories();
    (companyRepo.findByCnpj as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'other',
    } as Company);
    const useCase = new CreateCompanyUseCase(companyRepo, tenantRepo);

    await expect(useCase.execute(buildValidPayload())).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('isValidCnpj', () => {
  it('aceita CNPJs com DV correto', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita CNPJs com tamanho errado, repetidos ou DV inválido', () => {
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('11222333000100')).toBe(false);
  });
});

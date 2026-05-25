import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Product } from '@modules/Products/infra/typeorm/entities/Product';
import { ProductTaxRule } from '@modules/Products/infra/typeorm/entities/ProductTaxRule';
import { IProductRepository } from '@modules/Products/repositories/IProductRepository';
import { IProductTaxRuleRepository } from '@modules/Products/repositories/IProductTaxRuleRepository';
import { AddProductTaxRuleUseCase } from '@modules/Products/useCases/AddProductTaxRule/AddProductTaxRuleUseCase';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

function setup(existing: ProductTaxRule[] = []) {
  const product = { id: 'p-1', companyId: 'company-1' } as Product;
  const productRepo: IProductRepository = {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(async (companyId, id) =>
      companyId === 'company-1' && id === 'p-1' ? product : null,
    ),
    findByCodigo: vi.fn(),
    list: vi.fn(),
    softDelete: vi.fn(),
  };
  const ruleRepo: IProductTaxRuleRepository = {
    create: vi.fn(async (data) => ({ id: 'rule-x', ...data }) as unknown as ProductTaxRule),
    listByProduct: vi.fn(async () => existing),
    findActiveAt: vi.fn(),
  };
  const useCase = new AddProductTaxRuleUseCase(productRepo, ruleRepo);
  return { useCase, productRepo, ruleRepo };
}

function baseRule(overrides: Partial<{ validFrom: string; validTo: string | null }> = {}) {
  return {
    validFrom: '2026-01-01T00:00:00Z',
    validTo: null,
    cstIcms: '00',
    aliqIcms: '18.00',
    ...overrides,
  };
}

describe('AddProductTaxRuleUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria primeira regra para o produto', async () => {
    const { useCase, ruleRepo } = setup();
    const rule = await useCase.execute({
      companyId: 'company-1',
      productId: 'p-1',
      data: baseRule(),
    });
    expect(rule.id).toBe('rule-x');
    expect(ruleRepo.create).toHaveBeenCalledOnce();
  });

  it('rejeita produto inexistente', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({ companyId: 'company-1', productId: 'p-404', data: baseRule() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejeita validTo ≤ validFrom', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        companyId: 'company-1',
        productId: 'p-1',
        data: baseRule({ validFrom: '2026-06-01T00:00:00Z', validTo: '2026-01-01T00:00:00Z' }),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejeita sobreposição com janela existente', async () => {
    const existingRule = {
      id: 'rule-old',
      validFrom: new Date('2025-01-01T00:00:00Z'),
      validTo: null,
    } as ProductTaxRule;
    const { useCase } = setup([existingRule]);

    await expect(
      useCase.execute({
        companyId: 'company-1',
        productId: 'p-1',
        data: baseRule({ validFrom: '2026-01-01T00:00:00Z' }),
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('aceita janela imediatamente após uma fechada (validTo é exclusivo)', async () => {
    const existingRule = {
      id: 'rule-old',
      validFrom: new Date('2025-01-01T00:00:00Z'),
      validTo: new Date('2026-01-01T00:00:00Z'),
    } as ProductTaxRule;
    const { useCase, ruleRepo } = setup([existingRule]);

    const rule = await useCase.execute({
      companyId: 'company-1',
      productId: 'p-1',
      data: baseRule({ validFrom: '2026-01-01T00:00:00Z' }),
    });
    expect(rule.id).toBe('rule-x');
    expect(ruleRepo.create).toHaveBeenCalledOnce();
  });
});

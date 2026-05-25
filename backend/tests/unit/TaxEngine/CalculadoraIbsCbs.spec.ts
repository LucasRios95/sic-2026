import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { ProductTaxRule } from '@modules/Products/infra/typeorm/entities/ProductTaxRule';
import { CalculadoraIbsCbs } from '@modules/TaxEngine/calculadoras/CalculadoraIbsCbs';
import { ContextoCalculo, ItemContexto } from '@modules/TaxEngine/domain/ContextoCalculo';
import { TaxParameter } from '@modules/TaxEngine/infra/typeorm/entities/TaxParameter';
import { ITaxParameterRepository } from '@modules/TaxEngine/repositories/ITaxParameterRepository';
import { CstIbsCbs, IndicadorIE } from '@shared/types/fiscal-enums';

function makeContexto(overrides: Partial<ContextoCalculo> = {}): ContextoCalculo {
  return {
    dataOperacao: new Date('2026-06-15T12:00:00Z'),
    empresa: {
      companyId: 'company-1',
      crt: CodigoRegimeTributario.REGIME_NORMAL,
      uf: 'SP',
      flags: {
        usaIcms: true,
        usaIcmsSt: false,
        usaIpi: false,
        usaDifal: false,
        usaFcp: false,
        usaIcmsDesonerado: false,
      },
    },
    destinatario: {
      uf: 'SP',
      consumidorFinal: false,
      indicadorIE: IndicadorIE.CONTRIBUINTE,
    },
    itens: [],
    ...overrides,
  };
}

function makeItem(rule: Partial<ProductTaxRule> = {}): ItemContexto {
  return {
    itemId: 'item-1',
    productId: 'p-1',
    ncm: '12345678',
    origem: 0,
    quantidade: '1',
    valorUnitario: '1000.00',
    cfop: '5102',
    taxRule: {
      cstIbsCbs: CstIbsCbs.TRIBUTACAO_INTEGRAL,
      cClassTrib: '100000',
      ...rule,
    } as ProductTaxRule,
  };
}

function makeParamRepo(params: Record<string, unknown>): ITaxParameterRepository {
  return {
    findActiveAt: vi.fn(async (chave) => {
      const valor = params[chave];
      if (!valor) return null;
      return { chave, valor, validFrom: new Date('2026-01-01') } as TaxParameter;
    }),
    upsert: vi.fn(),
  };
}

describe('CalculadoraIbsCbs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('modo ANO_TESTE em 2026: marca modoAnoTesteIbsCbs = true e usa alíquotas simbólicas', async () => {
    const calc = new CalculadoraIbsCbs(
      makeParamRepo({
        'ibs.aliquota.padrao': { aliquota: '0.1000', modo: 'ANO_TESTE' },
        'cbs.aliquota.padrao': { aliquota: '0.9000', modo: 'ANO_TESTE' },
      }),
    );

    const slice = await calc.calcular(makeContexto(), makeItem());

    expect(slice.campos.modoAnoTesteIbsCbs).toBe(true);
    expect(slice.campos.aliqIbs).toBe('0.1000');
    expect(slice.campos.aliqCbs).toBe('0.9000');
    // 1000 × 0.1% = 1.00 ; 1000 × 0.9% = 9.00
    expect(slice.campos.valorIbs).toBe('1.00');
    expect(slice.campos.valorCbs).toBe('9.00');
    expect(slice.passo?.resumo).toMatch(/ano-teste/);
  });

  it('modo PLENO em 2027+: sem flag de ano-teste', async () => {
    const calc = new CalculadoraIbsCbs(
      makeParamRepo({
        'ibs.aliquota.padrao': { aliquota: '8.0000', modo: 'PLENO' },
        'cbs.aliquota.padrao': { aliquota: '8.8000', modo: 'PLENO' },
      }),
    );

    const slice = await calc.calcular(
      makeContexto({ dataOperacao: new Date('2027-03-15T12:00:00Z') }),
      makeItem(),
    );

    expect(slice.campos.modoAnoTesteIbsCbs).toBe(false);
    expect(slice.campos.valorCbs).toBe('88.00');
    expect(slice.passo?.resumo).toMatch(/pleno/);
  });

  it('alíquota do produto sobrescreve a global', async () => {
    const calc = new CalculadoraIbsCbs(
      makeParamRepo({
        'ibs.aliquota.padrao': { aliquota: '0.1000', modo: 'ANO_TESTE' },
        'cbs.aliquota.padrao': { aliquota: '0.9000', modo: 'ANO_TESTE' },
      }),
    );

    const slice = await calc.calcular(
      makeContexto(),
      makeItem({ aliqIbsProduto: '5.0000', aliqCbsProduto: '10.0000' }),
    );

    expect(slice.campos.aliqIbs).toBe('5.0000');
    expect(slice.campos.aliqCbs).toBe('10.0000');
  });

  it('CST ISENCAO: não tributa, apenas registra CST e cClassTrib', async () => {
    const calc = new CalculadoraIbsCbs(makeParamRepo({}));

    const slice = await calc.calcular(
      makeContexto(),
      makeItem({ cstIbsCbs: CstIbsCbs.ISENCAO, cClassTrib: '600100' }),
    );

    expect(slice.campos.valorIbs).toBeUndefined();
    expect(slice.campos.valorCbs).toBeUndefined();
    expect(slice.campos.cstIbsCbs).toBe(CstIbsCbs.ISENCAO);
    expect(slice.campos.cClassTrib).toBe('600100');
  });

  it('cClassTrib ausente gera warning (campo obrigatório RT 2025.002)', async () => {
    const calc = new CalculadoraIbsCbs(
      makeParamRepo({
        'ibs.aliquota.padrao': { aliquota: '0.1', modo: 'ANO_TESTE' },
        'cbs.aliquota.padrao': { aliquota: '0.9', modo: 'ANO_TESTE' },
      }),
    );

    const slice = await calc.calcular(makeContexto(), makeItem({ cClassTrib: null }));

    expect(slice.warnings?.[0]).toMatch(/cClassTrib/);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { ProductTaxRule } from '@modules/Products/infra/typeorm/entities/ProductTaxRule';
import { CalculadoraIcmsProprio } from '@modules/TaxEngine/calculadoras/CalculadoraIcmsProprio';
import { ContextoCalculo, ItemContexto } from '@modules/TaxEngine/domain/ContextoCalculo';
import { InterstateAliquot } from '@modules/TaxEngine/infra/typeorm/entities/InterstateAliquot';
import { IInterstateAliquotRepository } from '@modules/TaxEngine/repositories/IInterstateAliquotRepository';
import { IndicadorIE } from '@shared/types/fiscal-enums';

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

function makeItem(overrides: Partial<ItemContexto> = {}): ItemContexto {
  return {
    itemId: 'item-1',
    productId: 'p-1',
    ncm: '12345678',
    origem: 0,
    quantidade: '10',
    valorUnitario: '10.00', // valor bruto = 100
    cfop: '5102',
    taxRule: { aliqIcms: '18.0000' } as ProductTaxRule,
    ...overrides,
  };
}

function makeInterstateRepo(rows: Record<string, string>): IInterstateAliquotRepository {
  return {
    findActiveAt: vi.fn(async (origem, destino) => {
      const key = `${origem}->${destino}`;
      const aliq = rows[key];
      if (!aliq) return null;
      return {
        aliqNacional: aliq,
        aliqImportado: '4.0000',
      } as InterstateAliquot;
    }),
    upsert: vi.fn(),
  };
}

describe('CalculadoraIcmsProprio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SP intraestadual sem redução: ICMS = base × 18%', async () => {
    const calc = new CalculadoraIcmsProprio(makeInterstateRepo({}));
    const ctx = makeContexto();
    const item = makeItem();

    const slice = await calc.calcular(ctx, item);

    expect(slice.campos.valorIcms).toBe('18.00');
    expect(slice.campos.aliqIcms).toBe('18.0000');
    expect(slice.campos.baseIcms).toBe('100.00');
  });

  it('SP → AM interestadual nacional: alíquota 7% (Sul/Sudeste exc. ES → Norte)', async () => {
    const calc = new CalculadoraIcmsProprio(
      makeInterstateRepo({ 'SP->AM': '7.0000' }),
    );
    const ctx = makeContexto({
      destinatario: { uf: 'AM', consumidorFinal: false, indicadorIE: IndicadorIE.CONTRIBUINTE },
    });
    const item = makeItem();

    const slice = await calc.calcular(ctx, item);

    expect(slice.campos.valorIcms).toBe('7.00');
    expect(slice.campos.aliqIcms).toBe('7.0000');
  });

  it('produto importado SP → MG: alíquota 4% (Res. Senado 13/2012)', async () => {
    const calc = new CalculadoraIcmsProprio(
      makeInterstateRepo({ 'SP->MG': '12.0000' }),
    );
    const ctx = makeContexto({
      destinatario: { uf: 'MG', consumidorFinal: false, indicadorIE: IndicadorIE.CONTRIBUINTE },
    });
    const item = makeItem({ origem: 1 }); // importação direta

    const slice = await calc.calcular(ctx, item);

    expect(slice.campos.valorIcms).toBe('4.00');
    expect(slice.campos.aliqIcms).toBe('4.0000');
  });

  it('redução de base pRedBC = 33.33%: base reduzida antes de aplicar alíquota', async () => {
    const calc = new CalculadoraIcmsProprio(makeInterstateRepo({}));
    const ctx = makeContexto();
    const item = makeItem({
      taxRule: { aliqIcms: '18.0000', pRedBC: '33.3300' } as ProductTaxRule,
    });

    const slice = await calc.calcular(ctx, item);

    // base original 100 × (1 - 0.3333) = 66.67
    expect(slice.campos.baseIcms).toBe('66.67');
    // ICMS = 66.67 × 18% = 12.0006 → arredonda HALF_EVEN para 12.00
    expect(slice.campos.valorIcms).toBe('12.00');
  });

  it('empresa sem usaIcms: aplica() retorna false', () => {
    const calc = new CalculadoraIcmsProprio(makeInterstateRepo({}));
    const ctx = makeContexto({
      empresa: {
        ...makeContexto().empresa,
        flags: { ...makeContexto().empresa.flags, usaIcms: false },
      },
    });

    expect(calc.aplica(ctx, makeItem())).toBe(false);
  });

  it('intraestadual sem aliqIcms cadastrada: gera warning e não calcula', async () => {
    const calc = new CalculadoraIcmsProprio(makeInterstateRepo({}));
    const ctx = makeContexto();
    const item = makeItem({ taxRule: {} as ProductTaxRule });

    const slice = await calc.calcular(ctx, item);

    expect(slice.campos.valorIcms).toBeUndefined();
    expect(slice.warnings?.[0]).toMatch(/aliqIcms/);
  });

  it('interestadual sem registro na tabela: gera warning e não calcula', async () => {
    const calc = new CalculadoraIcmsProprio(makeInterstateRepo({}));
    const ctx = makeContexto({
      destinatario: { uf: 'MG', consumidorFinal: false, indicadorIE: IndicadorIE.CONTRIBUINTE },
    });
    const item = makeItem();

    const slice = await calc.calcular(ctx, item);

    expect(slice.campos.valorIcms).toBeUndefined();
    expect(slice.warnings?.[0]).toMatch(/interestadual/);
  });
});

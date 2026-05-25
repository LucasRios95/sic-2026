import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { ProductTaxRule } from '@modules/Products/infra/typeorm/entities/ProductTaxRule';
import { CalculadoraPisCofins } from '@modules/TaxEngine/calculadoras/CalculadoraPisCofins';
import { ContextoCalculo, ItemContexto } from '@modules/TaxEngine/domain/ContextoCalculo';
import { TaxParameter } from '@modules/TaxEngine/infra/typeorm/entities/TaxParameter';
import { ITaxParameterRepository } from '@modules/TaxEngine/repositories/ITaxParameterRepository';
import { IndicadorIE } from '@shared/types/fiscal-enums';

function makeContexto(dataOperacao: Date): ContextoCalculo {
  return {
    dataOperacao,
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
  };
}

function makeItem(): ItemContexto {
  return {
    itemId: 'item-1',
    productId: 'p-1',
    ncm: '12345678',
    origem: 0,
    quantidade: '1',
    valorUnitario: '1000.00',
    cfop: '5102',
    taxRule: {
      cstPis: '01',
      aliqPis: '1.6500',
      cstCofins: '01',
      aliqCofins: '7.6000',
    } as ProductTaxRule,
  };
}

const paramRepoCom: ITaxParameterRepository = {
  findActiveAt: vi.fn(async (chave) => {
    if (chave !== 'pis_cofins.encerramento') return null;
    return {
      chave,
      valor: { dataExtincao: '2027-01-01' },
      validFrom: new Date('2026-01-01'),
    } as TaxParameter;
  }),
  upsert: vi.fn(),
};

describe('CalculadoraPisCofins', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Vigência 2026: PIS e COFINS calculados normalmente', async () => {
    const calc = new CalculadoraPisCofins(paramRepoCom);
    const slice = await calc.calcular(makeContexto(new Date('2026-06-15T12:00:00Z')), makeItem());

    expect(slice.campos.valorPis).toBe('16.50');
    expect(slice.campos.valorCofins).toBe('76.00');
  });

  it('Vigência 2027+: skipado (extinto pela Reforma)', async () => {
    const calc = new CalculadoraPisCofins(paramRepoCom);
    const slice = await calc.calcular(makeContexto(new Date('2027-01-01T12:00:00Z')), makeItem());

    expect(slice.campos.valorPis).toBeUndefined();
    expect(slice.campos.valorCofins).toBeUndefined();
    expect(slice.passo?.resumo).toMatch(/extinto/);
  });

  it('Sem parâmetro de encerramento (configuração futura ausente): segue calculando', async () => {
    const paramRepoVazio: ITaxParameterRepository = {
      findActiveAt: vi.fn(async () => null),
      upsert: vi.fn(),
    };
    const calc = new CalculadoraPisCofins(paramRepoVazio);
    const slice = await calc.calcular(
      makeContexto(new Date('2026-06-15T12:00:00Z')),
      makeItem(),
    );

    expect(slice.campos.valorPis).toBe('16.50');
  });
});

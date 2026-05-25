import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { ProductTaxRule } from '@modules/Products/infra/typeorm/entities/ProductTaxRule';
import { CalculadoraDifal } from '@modules/TaxEngine/calculadoras/CalculadoraDifal';
import { ContextoCalculo, ItemContexto } from '@modules/TaxEngine/domain/ContextoCalculo';
import { IcmsInternaUf } from '@modules/TaxEngine/infra/typeorm/entities/IcmsInternaUf';
import { InterstateAliquot } from '@modules/TaxEngine/infra/typeorm/entities/InterstateAliquot';
import { IIcmsInternaUfRepository } from '@modules/TaxEngine/repositories/IIcmsInternaUfRepository';
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
        usaDifal: true,
        usaFcp: false,
        usaIcmsDesonerado: false,
      },
    },
    destinatario: {
      uf: 'AM',
      consumidorFinal: true,
      indicadorIE: IndicadorIE.NAO_CONTRIBUINTE,
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
    quantidade: '1',
    valorUnitario: '100.00',
    cfop: '6108',
    taxRule: { aliqIcms: '18.0000' } as ProductTaxRule,
    ...overrides,
  };
}

const interstateRepo: IInterstateAliquotRepository = {
  findActiveAt: vi.fn(async (origem, destino) => {
    if (origem === 'SP' && destino === 'AM') {
      return { aliqNacional: '7.0000', aliqImportado: '4.0000' } as InterstateAliquot;
    }
    return null;
  }),
  upsert: vi.fn(),
};

const internaRepo: IIcmsInternaUfRepository = {
  findActiveAt: vi.fn(async (uf) => {
    if (uf === 'AM') return { aliqInterna: '20.0000', aliqFcp: null } as IcmsInternaUf;
    return null;
  }),
  upsert: vi.fn(),
};

describe('CalculadoraDifal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SP → AM B2C: DIFAL = 100 × (20% − 7%) = 13.00', async () => {
    const calc = new CalculadoraDifal(interstateRepo, internaRepo);
    const ctx = makeContexto();
    const item = makeItem();

    expect(calc.aplica(ctx, item)).toBe(true);
    const slice = await calc.calcular(ctx, item);

    expect(slice.campos.pICMSInter).toBe('7.0000');
    expect(slice.campos.pICMSUFDest).toBe('20.0000');
    expect(slice.campos.valorICMSUFDest).toBe('13.00');
  });

  it('destinatário CONTRIBUINTE: motor pode continuar habilitando, mas aplica() ainda é true (controle pelo cliente final)', () => {
    // DIFAL classicamente só era B2C; com LC 190/2022 também B2B contribuinte em alguns casos.
    // O motor não decide essa parte — quem aplica é a flag `consumidorFinal`.
    const calc = new CalculadoraDifal(interstateRepo, internaRepo);
    const ctx = makeContexto({
      destinatario: {
        uf: 'AM',
        consumidorFinal: false, // contribuinte para revenda
        indicadorIE: IndicadorIE.CONTRIBUINTE,
      },
    });

    expect(calc.aplica(ctx, makeItem())).toBe(false);
  });

  it('empresa sem usaDifal: aplica() retorna false', () => {
    const calc = new CalculadoraDifal(interstateRepo, internaRepo);
    const ctx = makeContexto({
      empresa: {
        ...makeContexto().empresa,
        flags: { ...makeContexto().empresa.flags, usaDifal: false },
      },
    });

    expect(calc.aplica(ctx, makeItem())).toBe(false);
  });

  it('operação intraestadual: aplica() retorna false', () => {
    const calc = new CalculadoraDifal(interstateRepo, internaRepo);
    const ctx = makeContexto({
      destinatario: {
        uf: 'SP',
        consumidorFinal: true,
        indicadorIE: IndicadorIE.NAO_CONTRIBUINTE,
      },
    });

    expect(calc.aplica(ctx, makeItem())).toBe(false);
  });

  it('importado SP → MG B2C: pICMSInter = 4% mesmo sem registro Senado', async () => {
    const calc = new CalculadoraDifal(interstateRepo, {
      findActiveAt: vi.fn(async () => ({ aliqInterna: '18.0000', aliqFcp: null }) as IcmsInternaUf),
      upsert: vi.fn(),
    });
    const ctx = makeContexto({
      destinatario: {
        uf: 'MG',
        consumidorFinal: true,
        indicadorIE: IndicadorIE.NAO_CONTRIBUINTE,
      },
    });
    const item = makeItem({ origem: 2 });

    const slice = await calc.calcular(ctx, item);

    expect(slice.campos.pICMSInter).toBe('4.0000');
    // DIFAL = 100 × (18% − 4%) = 14.00
    expect(slice.campos.valorICMSUFDest).toBe('14.00');
  });
});

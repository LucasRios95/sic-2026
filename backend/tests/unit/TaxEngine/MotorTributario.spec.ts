import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { ProductTaxRule } from '@modules/Products/infra/typeorm/entities/ProductTaxRule';
import { CalculadoraDifal, CalculadoraFcpDestino } from '@modules/TaxEngine/calculadoras/CalculadoraDifal';
import { CalculadoraIbsCbs } from '@modules/TaxEngine/calculadoras/CalculadoraIbsCbs';
import { CalculadoraIcmsProprio } from '@modules/TaxEngine/calculadoras/CalculadoraIcmsProprio';
import { CalculadoraIcmsSt } from '@modules/TaxEngine/calculadoras/CalculadoraIcmsSt';
import { CalculadoraIpi } from '@modules/TaxEngine/calculadoras/CalculadoraIpi';
import { CalculadoraPisCofins } from '@modules/TaxEngine/calculadoras/CalculadoraPisCofins';
import { ContextoCalculo } from '@modules/TaxEngine/domain/ContextoCalculo';
import { IcmsInternaUf } from '@modules/TaxEngine/infra/typeorm/entities/IcmsInternaUf';
import { InterstateAliquot } from '@modules/TaxEngine/infra/typeorm/entities/InterstateAliquot';
import { TaxParameter } from '@modules/TaxEngine/infra/typeorm/entities/TaxParameter';
import { MotorTributario } from '@modules/TaxEngine/MotorTributario';
import { IIcmsInternaUfRepository } from '@modules/TaxEngine/repositories/IIcmsInternaUfRepository';
import { IIcmsStMvaRepository } from '@modules/TaxEngine/repositories/IIcmsStMvaRepository';
import { IInterstateAliquotRepository } from '@modules/TaxEngine/repositories/IInterstateAliquotRepository';
import { ITaxParameterRepository } from '@modules/TaxEngine/repositories/ITaxParameterRepository';
import { CstIbsCbs, IndicadorIE } from '@shared/types/fiscal-enums';

/**
 * Teste de integração do pipeline: cenário 3 itens SP→MG, 1 importado, todos com IBS/CBS
 * em modo ano-teste 2026. Verifica:
 *  - cada item tem ICMS próprio, IBS, CBS calculados
 *  - totais batem com a soma dos itens
 *  - modoAnoTesteIbsCbs propagado para o total
 */

const interstateRepo: IInterstateAliquotRepository = {
  findActiveAt: vi.fn(async () => ({ aliqNacional: '12.0000', aliqImportado: '4.0000' }) as InterstateAliquot),
  upsert: vi.fn(),
};

const internaRepo: IIcmsInternaUfRepository = {
  findActiveAt: vi.fn(async () => ({ aliqInterna: '18.0000', aliqFcp: null }) as IcmsInternaUf),
  upsert: vi.fn(),
};

const stRepo: IIcmsStMvaRepository = {
  findActiveAt: vi.fn(async () => null),
  upsert: vi.fn(),
};

const paramRepo: ITaxParameterRepository = {
  findActiveAt: vi.fn(async (chave) => {
    if (chave === 'ibs.aliquota.padrao') {
      return { chave, valor: { aliquota: '0.1000', modo: 'ANO_TESTE' } } as TaxParameter;
    }
    if (chave === 'cbs.aliquota.padrao') {
      return { chave, valor: { aliquota: '0.9000', modo: 'ANO_TESTE' } } as TaxParameter;
    }
    return null;
  }),
  upsert: vi.fn(),
};

function buildMotor(): MotorTributario {
  return new MotorTributario(
    new CalculadoraIcmsProprio(interstateRepo),
    new CalculadoraIcmsSt(stRepo, internaRepo, interstateRepo),
    new CalculadoraDifal(interstateRepo, internaRepo),
    new CalculadoraFcpDestino(internaRepo),
    new CalculadoraIpi(),
    new CalculadoraPisCofins(paramRepo),
    new CalculadoraIbsCbs(paramRepo),
  );
}

describe('MotorTributario — integração SP → MG (3 itens)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calcula 3 itens e agrega totais', async () => {
    const motor = buildMotor();

    const ruleBase: Partial<ProductTaxRule> = {
      aliqIcms: '12.0000',
      cstIbsCbs: CstIbsCbs.TRIBUTACAO_INTEGRAL,
      cClassTrib: '100000',
    };

    const ctx: ContextoCalculo = {
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
        uf: 'MG',
        consumidorFinal: false,
        indicadorIE: IndicadorIE.CONTRIBUINTE,
      },
      itens: [
        {
          itemId: 'i-1',
          ncm: '12345678',
          origem: 0,
          quantidade: '1',
          valorUnitario: '100.00',
          cfop: '6102',
          taxRule: { ...ruleBase } as ProductTaxRule,
        },
        {
          itemId: 'i-2',
          ncm: '87654321',
          origem: 1, // importado
          quantidade: '2',
          valorUnitario: '50.00',
          cfop: '6102',
          taxRule: { ...ruleBase } as ProductTaxRule,
        },
        {
          itemId: 'i-3',
          ncm: '11111111',
          origem: 0,
          quantidade: '1',
          valorUnitario: '200.00',
          cfop: '6102',
          taxRule: { ...ruleBase } as ProductTaxRule,
        },
      ],
    };

    const r = await motor.calcular(ctx);

    expect(r.itens).toHaveLength(3);

    // Item 1 (nacional): 100 × 12% = 12.00
    expect(r.itens[0].valorIcms).toBe('12.00');
    // Item 2 (importado): 100 × 4% = 4.00
    expect(r.itens[1].valorIcms).toBe('4.00');
    // Item 3: 200 × 12% = 24.00
    expect(r.itens[2].valorIcms).toBe('24.00');

    // IBS ano-teste 0,1%: itens 100, 100, 200 → 0.10 + 0.10 + 0.20 = 0.40
    expect(r.totais.valorIbs).toBe('0.40');
    // CBS ano-teste 0,9%: 0.90 + 0.90 + 1.80 = 3.60
    expect(r.totais.valorCbs).toBe('3.60');
    // ICMS total = 12 + 4 + 24 = 40.00
    expect(r.totais.valorIcms).toBe('40.00');
    // valorProdutos = 100 + 100 + 200 = 400
    expect(r.totais.valorProdutos).toBe('400.00');
    expect(r.totais.modoAnoTesteIbsCbs).toBe(true);
  });

  it('memória de cálculo registra cada calculadora aplicada', async () => {
    const motor = buildMotor();
    const ctx: ContextoCalculo = {
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
      destinatario: { uf: 'SP', consumidorFinal: false, indicadorIE: IndicadorIE.CONTRIBUINTE },
      itens: [
        {
          itemId: 'i-1',
          ncm: '12345678',
          origem: 0,
          quantidade: '1',
          valorUnitario: '100.00',
          cfop: '5102',
          taxRule: {
            aliqIcms: '18.0000',
            cstIbsCbs: CstIbsCbs.TRIBUTACAO_INTEGRAL,
            cClassTrib: '100000',
          } as ProductTaxRule,
        },
      ],
    };

    const r = await motor.calcular(ctx);
    const calculadorasUsadas = r.itens[0].memoria.map((p) => p.calculadora);

    expect(calculadorasUsadas).toContain('icms-proprio');
    expect(calculadorasUsadas).toContain('ibs-cbs');
    // PIS/COFINS não roda porque o item não tem CST cadastrado
    expect(calculadorasUsadas).not.toContain('pis-cofins');
  });
});

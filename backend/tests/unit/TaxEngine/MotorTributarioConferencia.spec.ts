import { describe, expect, it, vi } from 'vitest';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { ProductTaxRule } from '@modules/Products/infra/typeorm/entities/ProductTaxRule';
import { CalculadoraCreditoSimples } from '@modules/TaxEngine/calculadoras/CalculadoraCreditoSimples';
import { CalculadoraDifal, CalculadoraFcpDestino } from '@modules/TaxEngine/calculadoras/CalculadoraDifal';
import { CalculadoraIbsCbs } from '@modules/TaxEngine/calculadoras/CalculadoraIbsCbs';
import { CalculadoraIcmsProprio } from '@modules/TaxEngine/calculadoras/CalculadoraIcmsProprio';
import { CalculadoraIcmsSt } from '@modules/TaxEngine/calculadoras/CalculadoraIcmsSt';
import { CalculadoraIpi } from '@modules/TaxEngine/calculadoras/CalculadoraIpi';
import { CalculadoraPisCofins } from '@modules/TaxEngine/calculadoras/CalculadoraPisCofins';
import { CalculadoraTributosAproximados } from '@modules/TaxEngine/calculadoras/CalculadoraTributosAproximados';
import { ContextoCalculo, ItemContexto } from '@modules/TaxEngine/domain/ContextoCalculo';
import { IcmsInternaUf } from '@modules/TaxEngine/infra/typeorm/entities/IcmsInternaUf';
import { InterstateAliquot } from '@modules/TaxEngine/infra/typeorm/entities/InterstateAliquot';
import { TaxParameter } from '@modules/TaxEngine/infra/typeorm/entities/TaxParameter';
import { MotorTributario } from '@modules/TaxEngine/MotorTributario';
import { IndicadorIE } from '@shared/types/fiscal-enums';

/**
 * Cenários da conferência de impostos da emissão: totais coerentes com os itens (o que a
 * SEFAZ valida), tributos que NÃO podem ser calculados para certos CST/CSOSN/destinatários
 * e ajustes manuais de base/alíquota.
 */

const interstateRepo = {
  findActiveAt: vi.fn(async () => ({ aliqNacional: '12.0000', aliqImportado: '4.0000' }) as InterstateAliquot),
  upsert: vi.fn(),
};
const internaRepo = {
  findActiveAt: vi.fn(async () => ({ aliqInterna: '18.0000', aliqFcp: '2.0000' }) as IcmsInternaUf),
  upsert: vi.fn(),
};
const stRepo = { findActiveAt: vi.fn(async () => null), upsert: vi.fn() };

/** Repositório de parâmetros com as chaves informadas (o resto não existe). */
function paramRepoCom(params: Record<string, unknown> = {}) {
  return {
    findActiveAt: vi.fn(async (chave: string) =>
      chave in params ? ({ chave, valor: params[chave] } as TaxParameter) : null,
    ),
    upsert: vi.fn(),
  };
}

function buildMotor(params: Record<string, unknown> = {}): MotorTributario {
  const paramRepo = paramRepoCom(params);
  return new MotorTributario(
    new CalculadoraIcmsProprio(interstateRepo),
    new CalculadoraIcmsSt(stRepo, internaRepo, interstateRepo),
    new CalculadoraDifal(interstateRepo, internaRepo, paramRepo),
    new CalculadoraFcpDestino(internaRepo),
    new CalculadoraIpi(),
    new CalculadoraPisCofins(paramRepo),
    new CalculadoraIbsCbs(paramRepo),
    new CalculadoraCreditoSimples(paramRepo),
    new CalculadoraTributosAproximados(paramRepo),
  );
}

function ctx(
  itens: ItemContexto[],
  opts: {
    crt?: CodigoRegimeTributario;
    ufDestino?: string;
    consumidorFinal?: boolean;
    indicadorIE?: IndicadorIE;
    flags?: Partial<ContextoCalculo['empresa']['flags']>;
  } = {},
): ContextoCalculo {
  return {
    dataOperacao: new Date('2026-06-15T12:00:00Z'),
    empresa: {
      companyId: 'company-1',
      crt: opts.crt ?? CodigoRegimeTributario.REGIME_NORMAL,
      uf: 'SP',
      flags: {
        usaIcms: true,
        usaIcmsSt: true,
        usaIpi: true,
        usaDifal: true,
        usaFcp: true,
        usaIcmsDesonerado: false,
        ...opts.flags,
      },
    },
    destinatario: {
      uf: opts.ufDestino ?? 'SP',
      consumidorFinal: opts.consumidorFinal ?? false,
      indicadorIE: opts.indicadorIE ?? IndicadorIE.CONTRIBUINTE,
    },
    itens,
  };
}

function item(rule: Partial<ProductTaxRule>, overrides: Partial<ItemContexto> = {}): ItemContexto {
  return {
    itemId: 'i-1',
    ncm: '12345678',
    origem: 0,
    quantidade: '1',
    valorUnitario: '100.00',
    cfop: '5102',
    taxRule: rule as ProductTaxRule,
    ...overrides,
  };
}

describe('MotorTributario — totais coerentes com os itens', () => {
  it('agrega vBC e vBCST do ICMSTot a partir dos itens', async () => {
    const r = await buildMotor().calcular(
      ctx([
        item({ cstIcms: '00', aliqIcms: '18.0000' }, { itemId: 'a' }),
        item(
          { cstIcms: '10', cstIcmsSt: '10', aliqIcms: '18.0000', pMVAST: '40.0000' },
          { itemId: 'b' },
        ),
      ]),
    );
    expect(r.totais.baseIcms).toBe('200.00');
    expect(r.totais.valorIcms).toBe('36.00');
    // ST: 100 × 1,40 = 140 → 140 × 18% − 18 = 7,20
    expect(r.itens[1].baseIcmsST).toBe('140.00');
    expect(r.itens[1].valorIcmsST).toBe('7.20');
    expect(r.totais.baseIcmsST).toBe('140.00');
  });

  it('vProd do total é a soma dos vProd arredondados de cada item', async () => {
    // 3 × 0,335 = 1,005 → 1,00 por item (half-even); somar cru daria 3,015 → 3,02 ≠ 3,00.
    const itens = ['a', 'b', 'c'].map((id) =>
      item({}, { itemId: id, quantidade: '3', valorUnitario: '0.335' }),
    );
    const r = await buildMotor().calcular(ctx(itens));
    const somaItens = r.itens.reduce((acc, i) => acc + Number(i.valorTotal), 0).toFixed(2);
    expect(r.totais.valorProdutos).toBe(somaItens);
  });
});

describe('MotorTributario — tributos que não se aplicam', () => {
  it('CST 40 em operação interestadual não gera ICMS próprio', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '40' }, { cfop: '6102' })], { ufDestino: 'MG' }),
    );
    expect(r.itens[0].valorIcms).toBeUndefined();
    expect(r.totais.valorIcms).toBe('0.00');
  });

  it('CSOSN 500 (ST já retida) não calcula ICMS-ST nem infla o vNF', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ csosnIcms: '500', pMVAST: '40.0000', aliqIcms: '18.0000' })], {
        crt: CodigoRegimeTributario.SIMPLES_NACIONAL,
      }),
    );
    expect(r.itens[0].valorIcmsST).toBeUndefined();
    expect(r.totais.valorTotal).toBe('100.00');
  });

  it('Simples Nacional não calcula IPI (o XML não leva o grupo)', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ csosnIcms: '102', cstIpi: '50', aliqIpi: '10.0000' })], {
        crt: CodigoRegimeTributario.SIMPLES_NACIONAL,
      }),
    );
    expect(r.itens[0].valorIpi).toBeUndefined();
    expect(r.totais.valorTotal).toBe('100.00');
  });

  it('consumidor final CONTRIBUINTE interestadual não leva DIFAL/FCP destino', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '00' }, { cfop: '6102' })], {
        ufDestino: 'MG',
        consumidorFinal: true,
        indicadorIE: IndicadorIE.CONTRIBUINTE,
      }),
    );
    expect(r.itens[0].valorICMSUFDest).toBeUndefined();
    expect(r.itens[0].valorFCPUFDest).toBeUndefined();
  });

  it('consumidor final NÃO contribuinte interestadual leva DIFAL e FCP destino', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '00' }, { cfop: '6108' })], {
        ufDestino: 'MG',
        consumidorFinal: true,
        indicadorIE: IndicadorIE.NAO_CONTRIBUINTE,
      }),
    );
    // DIFAL = 100 × (18% − 12%) = 6,00; FCP = 100 × 2% = 2,00
    expect(r.itens[0].valorICMSUFDest).toBe('6.00');
    expect(r.itens[0].valorFCPUFDest).toBe('2.00');
  });

  it('IPI integra a base do ICMS quando o destinatário é consumidor final', async () => {
    const rule = { cstIcms: '00', aliqIcms: '18.0000', cstIpi: '50', aliqIpi: '10.0000' };
    const revenda = await buildMotor().calcular(ctx([item(rule)]));
    const consumo = await buildMotor().calcular(ctx([item(rule)], { consumidorFinal: true }));
    expect(revenda.itens[0].baseIcms).toBe('100.00');
    expect(consumo.itens[0].baseIcms).toBe('110.00');
    expect(consumo.itens[0].valorIcms).toBe('19.80');
  });
});

describe('MotorTributario — ajustes manuais da conferência', () => {
  it('base/alíquota digitadas recalculam valor e totais', async () => {
    const r = await buildMotor().calcular(
      ctx([
        item(
          { cstIcms: '00', aliqIcms: '18.0000', cstPis: '01', aliqPis: '1.6500' },
          { ajustes: { icms: { base: '80.00', aliquota: '12' }, pis: { aliquota: '0.65' } } },
        ),
      ]),
    );
    expect(r.itens[0].baseIcms).toBe('80.00');
    expect(r.itens[0].aliqIcms).toBe('12.0000');
    expect(r.itens[0].valorIcms).toBe('9.60');
    expect(r.totais.valorIcms).toBe('9.60');
    // PIS sobre (100 − ICMS 9,60) × 0,65% = 0,5876 → 0,59
    expect(r.itens[0].basePis).toBe('90.40');
    expect(r.itens[0].valorPis).toBe('0.59');
    expect(r.itens[0].memoria.find((p) => p.calculadora === 'icms-proprio')?.resumo).toContain(
      'ajustado manualmente',
    );
  });

  it('alíquota digitada habilita o ICMS quando a regra não tem alíquota', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '00' }, { ajustes: { icms: { aliquota: '18' } } })]),
    );
    expect(r.itens[0].valorIcms).toBe('18.00');
    expect(r.itens[0].warnings).toEqual([]);
  });

  it('ST deduz o ICMS próprio já ajustado e aceita MVA/base digitadas', async () => {
    const rule = { cstIcms: '10', cstIcmsSt: '10', aliqIcms: '18.0000', pMVAST: '40.0000' };
    const r = await buildMotor().calcular(
      ctx([item(rule, { ajustes: { icms: { aliquota: '12' }, icmsSt: { mva: '50' } } })]),
    );
    // ICMS = 12,00; BaseST = 150 → 150 × 18% − 12 = 15,00
    expect(r.itens[0].baseIcmsST).toBe('150.00');
    expect(r.itens[0].valorIcmsST).toBe('15.00');

    const comBase = await buildMotor().calcular(
      ctx([item(rule, { ajustes: { icmsSt: { base: '200.00' } } })]),
    );
    // 200 × 18% − 18 = 18,00
    expect(comBase.itens[0].valorIcmsST).toBe('18.00');
  });

  it('ST usa o pICMSST do produto no lugar da alíquota interna da UF', async () => {
    const rule = {
      cstIcms: '10',
      cstIcmsSt: '10',
      aliqIcms: '18.0000',
      pMVAST: '40.0000',
      pICMSST: '25.0000',
    };
    const r = await buildMotor().calcular(ctx([item(rule)]));
    // BaseST = 140 → 140 × 25% − 18 = 17,00 (com os 18% da UF seriam 7,20)
    expect(r.itens[0].aliqIcmsST).toBe('25.0000');
    expect(r.itens[0].valorIcmsST).toBe('17.00');

    const digitada = await buildMotor().calcular(
      ctx([item(rule, { ajustes: { icmsSt: { aliquota: '30' } } })]),
    );
    // Ajuste manual prevalece: 140 × 30% − 18 = 24,00
    expect(digitada.itens[0].valorIcmsST).toBe('24.00');
  });

  it('informa por que cada tributo não se aplica ao item', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ csosnIcms: '202', cstPis: '49' })], {
        crt: CodigoRegimeTributario.SIMPLES_NACIONAL,
        ufDestino: 'MG',
        flags: { usaIcmsSt: false },
      }),
    );
    const motivos = r.itens[0].calculadorasNaoAplicadas;
    expect(motivos['icms-st']).toBe('ICMS-ST desligado na configuração da empresa');
    expect(motivos['icms-proprio']).toMatch(/Simples Nacional/);
    expect(motivos['ibs-cbs']).toBe('Produto sem CST de IBS/CBS na regra tributária');
    expect(motivos.difal).toBe('Destinatário não é consumidor final');
    expect(motivos['pis-cofins']).toBeUndefined();
    expect(r.itens[0].calculadorasAplicadas).toContain('pis-cofins');
  });

  it('IBS/CBS sem CST no produto: informativo na prévia, fora da emissão', async () => {
    const params = {
      'ibs.aliquota.padrao': { aliquota: '0.1000', modo: 'ANO_TESTE' },
      'cbs.aliquota.padrao': { aliquota: '0.9000', modo: 'ANO_TESTE' },
    };
    const contexto = ctx([item({ csosnIcms: '102' })], {
      crt: CodigoRegimeTributario.SIMPLES_NACIONAL,
    });

    const previa = await buildMotor(params).calcular({ ...contexto, somentePrevia: true });
    // 100 × 0,1% = 0,10; 100 × 0,9% = 0,90 — sem CST, que é o que leva o grupo ao XML.
    expect(previa.itens[0].valorIbs).toBe('0.10');
    expect(previa.itens[0].valorCbs).toBe('0.90');
    expect(previa.itens[0].cstIbsCbs).toBeUndefined();
    expect(previa.itens[0].warnings.join(' ')).toMatch(/informativo/);

    const emissao = await buildMotor(params).calcular(contexto);
    expect(emissao.itens[0].valorIbs).toBeUndefined();
    expect(emissao.totais.valorIbs).toBe('0.00');
  });

  it('ajuste não liga tributo que não se aplica ao CST', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '41' }, { ajustes: { icms: { base: '100', aliquota: '18' } } })]),
    );
    expect(r.itens[0].valorIcms).toBeUndefined();
    expect(r.itens[0].calculadorasAplicadas).not.toContain('icms-proprio');
  });
});

describe('MotorTributario — PIS/COFINS sem ICMS na base (Tema 69/STF)', () => {
  it('exclui o ICMS destacado da base de PIS e COFINS', async () => {
    const r = await buildMotor().calcular(
      ctx([
        item({
          cstIcms: '00',
          aliqIcms: '18.0000',
          cstPis: '01',
          aliqPis: '1.6500',
          cstCofins: '01',
          aliqCofins: '7.6000',
        }),
      ]),
    );
    // base = 100 − 18 = 82 → PIS 1,353 → 1,35; COFINS 6,232 → 6,23
    expect(r.itens[0].basePis).toBe('82.00');
    expect(r.itens[0].valorPis).toBe('1.35');
    expect(r.itens[0].baseCofins).toBe('82.00');
    expect(r.itens[0].valorCofins).toBe('6.23');
  });

  it('sem ICMS destacado (CST 40) a base fica cheia', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '40', cstPis: '01', aliqPis: '1.6500' })]),
    );
    expect(r.itens[0].basePis).toBe('100.00');
  });
});

describe('MotorTributario — diferimento (CST 51)', () => {
  it('diferimento parcial: vICMS = vICMSOp − vICMSDif', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '51', aliqIcms: '18.0000', pDif: '33.3300' })]),
    );
    // vICMSOp 18,00; diferido 18 × 33,33% = 5,9994 → 6,00; destacado 12,00
    expect(r.itens[0].valorIcmsOp).toBe('18.00');
    expect(r.itens[0].pDif).toBe('33.3300');
    expect(r.itens[0].valorIcmsDif).toBe('6.00');
    expect(r.itens[0].valorIcms).toBe('12.00');
    expect(r.totais.valorIcms).toBe('12.00');
  });

  it('diferimento total zera o destaque, mas mantém a base', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '51', aliqIcms: '18.0000', pDif: '100' })]),
    );
    expect(r.itens[0].baseIcms).toBe('100.00');
    expect(r.itens[0].valorIcms).toBe('0.00');
  });

  it('sem % de diferimento: ICMS integral e aviso', async () => {
    const r = await buildMotor().calcular(ctx([item({ cstIcms: '51', aliqIcms: '18.0000' })]));
    expect(r.itens[0].valorIcms).toBe('18.00');
    expect(r.itens[0].valorIcmsDif).toBeUndefined();
    expect(r.itens[0].warnings.join(' ')).toContain('CST 51 sem percentual de diferimento');
  });

  it('% de diferimento digitado no ajuste prevalece', async () => {
    const r = await buildMotor().calcular(
      ctx([item({ cstIcms: '51', aliqIcms: '18.0000' }, { ajustes: { icms: { pDif: '50' } } })]),
    );
    expect(r.itens[0].valorIcms).toBe('9.00');
  });
});

describe('MotorTributario — DIFAL base dupla por UF', () => {
  const naoContribuinteMG = {
    ufDestino: 'MG',
    consumidorFinal: true,
    indicadorIE: IndicadorIE.NAO_CONTRIBUINTE,
  };

  it('UF com base dupla configurada: base por dentro da alíquota interna', async () => {
    const r = await buildMotor({ 'difal.base_dupla.uf.MG': { ativo: true } }).calcular(
      ctx([item({ cstIcms: '00' }, { cfop: '6108' })], naoContribuinteMG),
    );
    // ICMS origem 100 × 12% = 12; base = 88 ÷ 0,82 = 107,32; DIFAL = 107,32 × 18% − 12 = 7,32
    expect(r.itens[0].baseICMSUFDest).toBe('107.32');
    expect(r.itens[0].valorICMSUFDest).toBe('7.32');
    // FCP destino segue a base do DIFAL: 107,32 × 2% = 2,15
    expect(r.itens[0].baseFCPUFDest).toBe('107.32');
    expect(r.itens[0].valorFCPUFDest).toBe('2.15');
  });

  it('UF sem o parâmetro (ou ativo=false) usa base única', async () => {
    const r = await buildMotor({ 'difal.base_dupla.uf.MG': { ativo: false } }).calcular(
      ctx([item({ cstIcms: '00' }, { cfop: '6108' })], naoContribuinteMG),
    );
    expect(r.itens[0].baseICMSUFDest).toBe('100.00');
    expect(r.itens[0].valorICMSUFDest).toBe('6.00');
  });
});

describe('MotorTributario — crédito de ICMS do Simples', () => {
  const simples = { crt: CodigoRegimeTributario.SIMPLES_NACIONAL };

  it('CSOSN 101 usa a alíquota de crédito cadastrada para a empresa', async () => {
    const r = await buildMotor({ 'simples.credito_icms.aliquota': { aliquota: '2.5600' } }).calcular(
      ctx([item({ csosnIcms: '101' })], simples),
    );
    expect(r.itens[0].pCredSN).toBe('2.5600');
    expect(r.itens[0].valorCredSN).toBe('2.56');
    expect(r.totais.valorCredSN).toBe('2.56');
    // crédito não é ICMS destacado nem compõe o total
    expect(r.totais.valorIcms).toBe('0.00');
    expect(r.totais.valorTotal).toBe('100.00');
  });

  it('CSOSN 101 sem alíquota cadastrada avisa', async () => {
    const r = await buildMotor().calcular(ctx([item({ csosnIcms: '101' })], simples));
    expect(r.itens[0].pCredSN).toBeUndefined();
    expect(r.itens[0].warnings.join(' ')).toContain('alíquota de crédito do Simples');
  });

  it('CSOSN 102 não gera crédito', async () => {
    const r = await buildMotor({ 'simples.credito_icms.aliquota': { aliquota: '2.56' } }).calcular(
      ctx([item({ csosnIcms: '102' })], simples),
    );
    expect(r.itens[0].pCredSN).toBeUndefined();
  });
});

describe('MotorTributario — valor aproximado dos tributos (Lei 12.741)', () => {
  const rule = {
    cstIcms: '00',
    aliqIcms: '18.0000',
    cstPis: '01',
    aliqPis: '1.6500',
    cstCofins: '01',
    aliqCofins: '7.6000',
  };

  it('Regime Normal, consumidor final: soma tributos por ente', async () => {
    const r = await buildMotor().calcular(ctx([item(rule)], { consumidorFinal: true }));
    // estaduais: ICMS 18,00; federais: PIS 1,35 + COFINS 6,23 = 7,58
    expect(r.itens[0].valorTotTribEstadual).toBe('18.00');
    expect(r.itens[0].valorTotTribFederal).toBe('7.58');
    expect(r.itens[0].valorTotTrib).toBe('25.58');
    expect(r.totais.valorTotTrib).toBe('25.58');
  });

  it('venda para revenda (não consumidor final) não preenche vTotTrib', async () => {
    const r = await buildMotor().calcular(ctx([item(rule)]));
    expect(r.itens[0].valorTotTrib).toBeUndefined();
    expect(r.totais.valorTotTrib).toBe('0.00');
  });

  it('Simples: alíquota efetiva do DAS sobre o valor do item', async () => {
    const r = await buildMotor({ 'simples.aliquota_efetiva': { aliquota: '6.0000' } }).calcular(
      ctx([item({ csosnIcms: '102' })], {
        crt: CodigoRegimeTributario.SIMPLES_NACIONAL,
        consumidorFinal: true,
      }),
    );
    expect(r.itens[0].valorTotTrib).toBe('6.00');
  });
});

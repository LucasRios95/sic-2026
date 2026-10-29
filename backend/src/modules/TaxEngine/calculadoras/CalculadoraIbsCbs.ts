import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { ajusteOu, baseDefaultItem, temAjuste } from '../domain/item-utils';
import { ITaxParameterRepository } from '../repositories/ITaxParameterRepository';

/**
 * Calculadora de IBS e CBS (Reforma Tributária — RT 2025.002 / LC 214/2025).
 *
 * Modos de operação:
 *   - ANO_TESTE (vigência 2026): alíquotas simbólicas (CBS 0,9% / IBS 0,1%) com
 *     `modoAnoTeste = true`. Sinaliza no resultado que o cálculo é destaque-apenas,
 *     SEM gerar obrigação de recolhimento. NFe-23 / NFS-13 do PRD.
 *   - PLENO (vigência 2027+): alíquotas reais cadastradas em TaxParameter, com IBS
 *     adotando princípio do DESTINO (uf do destinatário decide a alíquota estadual).
 *
 * Resolução de alíquota (em ordem de precedência):
 *   1. ProductTaxRule.aliqIbsProduto/aliqCbsProduto (sobrescrita do produto)
 *   2. TaxParameter empresa-específico ("ibs.aliquota.uf.SP")
 *   3. TaxParameter global ("ibs.aliquota.padrao" ou por UF)
 *
 * Casos especiais cobertos:
 *   - cstIbsCbs em ISENCAO/IMUNIDADE/NAO_INCIDENCIA → não tributa (apenas registra CST).
 *   - SUFRAMA / ZFM: tratamento via TaxParameter ("ibs.zfm.aliquota.zero") — fora do
 *     escopo desta fase mas o motor já carrega o suframa no contexto para extensão futura.
 */
@injectable()
export class CalculadoraIbsCbs implements ICalculadoraTributo {
  readonly nome = 'ibs-cbs';

  constructor(
    @inject('TaxParameterRepository')
    private readonly taxParam: ITaxParameterRepository,
  ) {}

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    return this.motivoNaoAplica(contexto, item) === null;
  }

  motivoNaoAplica(_contexto: ContextoCalculo, item: ItemContexto): string | null {
    return item.taxRule.cstIbsCbs ? null : 'Produto sem CST de IBS/CBS na regra tributária';
  }

  async calcular(contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice> {
    const rule = item.taxRule;
    const warnings: string[] = [];

    // CSTs que não tributam mas precisam ser destacadas no XML.
    const cstSemTributacao = ['ISENCAO', 'IMUNIDADE', 'NAO_INCIDENCIA'];
    if (rule.cstIbsCbs && cstSemTributacao.includes(rule.cstIbsCbs)) {
      return {
        campos: {
          cstIbsCbs: rule.cstIbsCbs,
          ...(rule.cClassTrib ? { cClassTrib: rule.cClassTrib } : {}),
        },
        passo: {
          calculadora: this.nome,
          resumo: `IBS/CBS ${rule.cstIbsCbs} — sem tributação`,
          detalhe: { cst: rule.cstIbsCbs },
        },
        warnings,
      };
    }

    if (!rule.cClassTrib) {
      warnings.push(
        'cClassTrib ausente na regra do produto — campo obrigatório para IBS/CBS conforme RT 2025.002',
      );
    }

    // Carrega parâmetros vigentes (preferindo empresa-específico).
    const ibsParam = await this.taxParam.findActiveAt(
      'ibs.aliquota.padrao',
      contexto.empresa.companyId,
      contexto.dataOperacao,
    );
    const cbsParam = await this.taxParam.findActiveAt(
      'cbs.aliquota.padrao',
      contexto.empresa.companyId,
      contexto.dataOperacao,
    );

    if (!ibsParam || !cbsParam) {
      warnings.push('Parâmetros ibs.aliquota.padrao/cbs.aliquota.padrao ausentes para a data');
      return { campos: { cstIbsCbs: rule.cstIbsCbs ?? undefined }, warnings };
    }

    const ibsCfg = ibsParam.valor as { aliquota: string; modo?: 'ANO_TESTE' | 'PLENO' };
    const cbsCfg = cbsParam.valor as { aliquota: string; modo?: 'ANO_TESTE' | 'PLENO' };
    const modoAnoTeste = ibsCfg.modo === 'ANO_TESTE' || cbsCfg.modo === 'ANO_TESTE';

    // Alíquota efetiva: ajuste manual > produto > global.
    const ajuste = item.ajustes?.ibsCbs;
    const manual = temAjuste(ajuste);
    const aliqIbs = ajusteOu(ajuste?.aliquotaIbs, new Money(rule.aliqIbsProduto ?? ibsCfg.aliquota));
    const aliqCbs = ajusteOu(ajuste?.aliquotaCbs, new Money(rule.aliqCbsProduto ?? cbsCfg.aliquota));

    const base = ajusteOu(ajuste?.base, baseDefaultItem(item)).round(2);
    const valorIbs = base.applyPercent(aliqIbs);
    const valorCbs = base.applyPercent(aliqCbs);

    return {
      campos: {
        cstIbsCbs: rule.cstIbsCbs ?? undefined,
        ...(rule.cClassTrib ? { cClassTrib: rule.cClassTrib } : {}),
        baseIbsCbs: base.toString(2),
        aliqIbs: aliqIbs.round(4).toString(4),
        valorIbs: valorIbs.round(2).toString(2),
        aliqCbs: aliqCbs.round(4).toString(4),
        valorCbs: valorCbs.round(2).toString(2),
        modoAnoTesteIbsCbs: modoAnoTeste,
      },
      passo: {
        calculadora: this.nome,
        resumo:
          (modoAnoTeste
            ? `IBS/CBS ano-teste 2026: base × (IBS ${aliqIbs.toString(4)}% + CBS ${aliqCbs.toString(4)}%) — sem recolhimento`
            : `IBS/CBS pleno: base × (IBS ${aliqIbs.toString(4)}% + CBS ${aliqCbs.toString(4)}%)`) +
          (manual ? ' (ajustado manualmente)' : ''),
        detalhe: {
          modo: modoAnoTeste ? 'ANO_TESTE' : 'PLENO',
          ufDestino: contexto.destinatario.uf,
          aliqIbs: aliqIbs.toString(4),
          aliqCbs: aliqCbs.toString(4),
          fonteAliqIbs: ajuste?.aliquotaIbs
            ? 'ajuste-manual'
            : rule.aliqIbsProduto
              ? 'produto'
              : 'parametro-global',
          fonteAliqCbs: ajuste?.aliquotaCbs
            ? 'ajuste-manual'
            : rule.aliqCbsProduto
              ? 'produto'
              : 'parametro-global',
          ajusteManual: manual,
        },
      },
      warnings,
    };
  }
}

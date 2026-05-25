import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { baseDefaultItem, isImportado } from '../domain/item-utils';
import { IInterstateAliquotRepository } from '../repositories/IInterstateAliquotRepository';

/**
 * Calculadora do ICMS próprio.
 *
 * Resolução de alíquota:
 *  1) Se operação INTERESTADUAL (UF origem ≠ UF destino):
 *     - Produto importado (origem 1/2/3/5/6/7/8): 4% (Res. Senado 13/2012).
 *     - Caso contrário: alíquota nacional do par UF/UF (Res. Senado 22/89 — 7% ou 12%).
 *  2) Se INTRAESTADUAL:
 *     - Alíquota cadastrada em ProductTaxRule.aliqIcms (sobrescrita pela empresa) — porque
 *       a alíquota interna efetiva pode variar por produto/benefício e o motor confia na regra.
 *
 * Redução de base (pRedBC > 0) é aplicada multiplicativamente sobre a base default.
 * Desoneração (motDesICMS) registra vICMSDeson para o XML, sem impactar o valor próprio.
 */
@injectable()
export class CalculadoraIcmsProprio implements ICalculadoraTributo {
  readonly nome = 'icms-proprio';

  constructor(
    @inject('InterstateAliquotRepository')
    private readonly interstate: IInterstateAliquotRepository,
  ) {}

  aplica(contexto: ContextoCalculo, _item: ItemContexto): boolean {
    return contexto.empresa.flags.usaIcms;
  }

  async calcular(contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice> {
    const rule = item.taxRule;
    const ufOrigem = contexto.empresa.uf;
    const ufDestino = contexto.destinatario.uf;
    const interestadual = ufOrigem !== ufDestino;
    const warnings: string[] = [];

    let aliqIcms: Money;
    let modoAliquota: string;
    if (interestadual) {
      if (isImportado(item.origem)) {
        aliqIcms = new Money('4');
        modoAliquota = 'interestadual-importado';
      } else {
        const row = await this.interstate.findActiveAt(ufOrigem, ufDestino, contexto.dataOperacao);
        if (!row) {
          warnings.push(
            `Sem alíquota interestadual cadastrada para ${ufOrigem}→${ufDestino} em ${contexto.dataOperacao.toISOString()}`,
          );
          return { campos: {}, warnings };
        }
        aliqIcms = new Money(row.aliqNacional);
        modoAliquota = 'interestadual-nacional';
      }
    } else {
      if (!rule.aliqIcms) {
        warnings.push(
          'Produto sem aliqIcms cadastrada na regra vigente — ICMS próprio não calculado',
        );
        return { campos: {}, warnings };
      }
      aliqIcms = new Money(rule.aliqIcms);
      modoAliquota = 'intraestadual-produto';
    }

    let base = baseDefaultItem(item);
    if (rule.pRedBC) {
      // pRedBC é o PERCENTUAL de redução. base × (1 − pRedBC/100).
      const fator = new Money('1').sub(new Money(rule.pRedBC).div(100));
      base = base.mul(fator);
    }

    const valorIcms = base.applyPercent(aliqIcms);

    // Desoneração: registra vICMSDeson sem mexer no valorIcms (regra da NF-e).
    let valorIcmsDeson: string | undefined;
    if (
      contexto.empresa.flags.usaIcmsDesonerado &&
      rule.motDesICMS &&
      rule.pICMSEfetivo
    ) {
      // vICMSDeson = base × (aliqIcms - aliqEfetiva)
      const aliqEfetiva = new Money(rule.pICMSEfetivo);
      const diff = aliqIcms.sub(aliqEfetiva);
      if (diff.isPositive()) {
        valorIcmsDeson = base.applyPercent(diff).round(2).toString(2);
      }
    }

    return {
      campos: {
        baseIcms: base.round(2).toString(2),
        aliqIcms: aliqIcms.round(4).toString(4),
        valorIcms: valorIcms.round(2).toString(2),
        ...(rule.motDesICMS ? { motDesICMS: rule.motDesICMS } : {}),
        ...(valorIcmsDeson ? { valorIcmsDeson } : {}),
      },
      passo: {
        calculadora: this.nome,
        resumo: `ICMS ${modoAliquota}: base × ${aliqIcms.round(4).toString(4)}%`,
        detalhe: {
          ufOrigem,
          ufDestino,
          interestadual,
          importado: isImportado(item.origem),
          baseAposReducao: base.round(2).toString(2),
          aliquota: aliqIcms.round(4).toString(4),
        },
      },
      warnings,
    };
  }
}

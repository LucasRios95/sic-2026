import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import {
  ajusteOu,
  baseDefaultItem,
  CST_COM_ICMS_PROPRIO,
  isImportado,
  temAjuste,
} from '../domain/item-utils';
import { ResultadoCalculoItem } from '../domain/ResultadoCalculo';
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
 * Base: valor do item (− desconto + frete/seguro/outros). O IPI integra a base quando o
 * destinatário é consumidor final (CF art. 155 §2º XI — só fica de fora entre contribuintes
 * com mercadoria para industrialização/comercialização). Redução de base (pRedBC > 0) é
 * aplicada multiplicativamente. O valor é base ARREDONDADA × alíquota, exatamente o que o
 * XML mostra (vBC × pICMS), evitando divergência de centavo na conferência (cStat 528).
 *
 * CST 51 (diferimento): vICMSOp = base × alíquota; vICMSDif = vICMSOp × pDif; o destaque
 * (vICMS, que vai ao total) é a diferença. pDif vem da regra ou do ajuste manual.
 *
 * Desoneração (motDesICMS) registra vICMSDeson para o XML, sem impactar o valor próprio.
 * Ajustes manuais (`item.ajustes.icms`) substituem base, alíquota e/ou % de diferimento.
 */
@injectable()
export class CalculadoraIcmsProprio implements ICalculadoraTributo {
  readonly nome = 'icms-proprio';

  constructor(
    @inject('InterstateAliquotRepository')
    private readonly interstate: IInterstateAliquotRepository,
  ) {}

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    return this.motivoNaoAplica(contexto, item) === null;
  }

  motivoNaoAplica(contexto: ContextoCalculo, item: ItemContexto): string | null {
    if (!contexto.empresa.flags.usaIcms) return 'ICMS desligado na configuração da empresa';
    // Simples Nacional NÃO destaca ICMS próprio: o item vira grupo ICMSSN (CSOSN) e o
    // imposto é recolhido no DAS. Logo ICMSTot.vICMS tem que ser 0 — se calcularmos aqui,
    // o total diverge do somatório dos itens (item ICMSSN não tem vICMS) e a SEFAZ rejeita
    // com cStat 532. O crédito do SN (CSOSN 101/201) é outro conceito (vCredICMSSN), não
    // entra no vICMS e fica para uma calculadora dedicada.
    if (item.taxRule.csosnIcms) return 'Simples Nacional: ICMS próprio recolhido no DAS, sem destaque';
    // CST sem ICMS próprio no grupo (30/40/41/50/60): nada a destacar. Antes calculávamos
    // em operação interestadual (alíquota da tabela) e o vICMS ia para o total sem existir
    // no item. CST ausente (regra incompleta) segue calculando — a emissão já barra isso.
    const cst = item.taxRule.cstIcms;
    return !cst || CST_COM_ICMS_PROPRIO.includes(cst.padStart(2, '0'))
      ? null
      : `CST ${cst} sem ICMS próprio`;
  }

  async calcular(
    contexto: ContextoCalculo,
    item: ItemContexto,
    parcial?: Readonly<ResultadoCalculoItem>,
  ): Promise<CalculadoraSlice> {
    const rule = item.taxRule;
    const ajuste = item.ajustes?.icms;
    const manual = temAjuste(ajuste);
    const ufOrigem = contexto.empresa.uf;
    const ufDestino = contexto.destinatario.uf;
    const interestadual = ufOrigem !== ufDestino;
    const warnings: string[] = [];

    let aliqResolvida: Money | null = null;
    let modoAliquota: string;
    if (interestadual) {
      if (isImportado(item.origem)) {
        aliqResolvida = new Money('4');
        modoAliquota = 'interestadual-importado';
      } else {
        const row = await this.interstate.findActiveAt(ufOrigem, ufDestino, contexto.dataOperacao);
        if (row) aliqResolvida = new Money(row.aliqNacional);
        else if (!ajuste?.aliquota) {
          warnings.push(
            `Sem alíquota interestadual cadastrada para ${ufOrigem}→${ufDestino} em ${contexto.dataOperacao.toISOString()}`,
          );
        }
        modoAliquota = 'interestadual-nacional';
      }
    } else {
      if (rule.aliqIcms) aliqResolvida = new Money(rule.aliqIcms);
      else if (!ajuste?.aliquota) {
        warnings.push(
          'Produto sem aliqIcms cadastrada na regra vigente — ICMS próprio não calculado',
        );
      }
      modoAliquota = 'intraestadual-produto';
    }

    const aliqIcms = ajusteOu(ajuste?.aliquota, aliqResolvida);
    if (!aliqIcms) return { campos: {}, warnings };
    if (ajuste?.aliquota) modoAliquota = 'ajuste-manual';

    let baseCalculada = baseDefaultItem(item);
    const ipiNaBase = contexto.destinatario.consumidorFinal && !!parcial?.valorIpi;
    if (ipiNaBase) baseCalculada = baseCalculada.add(parcial!.valorIpi!);
    if (rule.pRedBC) {
      // pRedBC é o PERCENTUAL de redução. base × (1 − pRedBC/100).
      const fator = new Money('1').sub(new Money(rule.pRedBC).div(100));
      baseCalculada = baseCalculada.mul(fator);
    }
    const base = ajusteOu(ajuste?.base, baseCalculada).round(2);

    // CST 51 — diferimento: o ICMS da operação (vICMSOp) é apurado inteiro, a parcela
    // diferida (vICMSDif = vICMSOp × pDif) sai do destaque e vICMS = vICMSOp − vICMSDif.
    // Sem pDif na regra nem no ajuste, NÃO presumimos diferimento (destacar a menor é o erro
    // pior): sai ICMS integral com aviso para cadastrar o percentual.
    const valorIcmsOperacao = base.applyPercent(aliqIcms).round(2);
    let valorIcms = valorIcmsOperacao;
    let diferimento: { pDif: Money; valorIcmsDif: Money } | null = null;
    if (rule.cstIcms?.padStart(2, '0') === '51') {
      const pDif = ajusteOu(ajuste?.pDif, rule.pDif ? new Money(rule.pDif) : null);
      if (pDif) {
        const valorIcmsDif = valorIcmsOperacao.applyPercent(pDif).round(2);
        valorIcms = valorIcmsOperacao.sub(valorIcmsDif);
        diferimento = { pDif, valorIcmsDif };
      } else {
        warnings.push(
          'CST 51 sem percentual de diferimento na regra do produto — ICMS destacado integralmente. ' +
            'Cadastre o % de diferimento ou ajuste no modal "Impostos".',
        );
      }
    }

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
        baseIcms: base.toString(2),
        aliqIcms: aliqIcms.round(4).toString(4),
        valorIcms: valorIcms.toString(2),
        ...(diferimento
          ? {
              valorIcmsOp: valorIcmsOperacao.toString(2),
              pDif: diferimento.pDif.round(4).toString(4),
              valorIcmsDif: diferimento.valorIcmsDif.toString(2),
            }
          : {}),
        ...(rule.motDesICMS ? { motDesICMS: rule.motDesICMS } : {}),
        ...(valorIcmsDeson ? { valorIcmsDeson } : {}),
      },
      passo: {
        calculadora: this.nome,
        resumo:
          `ICMS ${modoAliquota}: base × ${aliqIcms.round(4).toString(4)}%` +
          (diferimento
            ? ` − diferido ${diferimento.pDif.round(4).toString(4)}% (R$ ${diferimento.valorIcmsDif.toString(2)})`
            : '') +
          (manual ? ' (ajustado manualmente)' : ''),
        detalhe: {
          ufOrigem,
          ufDestino,
          interestadual,
          importado: isImportado(item.origem),
          ipiNaBase,
          baseAposReducao: base.toString(2),
          aliquota: aliqIcms.round(4).toString(4),
          ajusteManual: manual,
        },
      },
      warnings,
    };
  }
}

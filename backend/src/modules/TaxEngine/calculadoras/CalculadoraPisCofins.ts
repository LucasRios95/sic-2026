import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { ajusteOu, baseDefaultItem, temAjuste } from '../domain/item-utils';
import { ResultadoCalculoItem } from '../domain/ResultadoCalculo';
import { ITaxParameterRepository } from '../repositories/ITaxParameterRepository';

/** CST de PIS/COFINS 04–09: grupo PISNT/COFINSNT, sem vBC/alíquota/valor no XML. */
function cstNaoTributado(cst: string | null | undefined): boolean {
  return !!cst && ['04', '05', '06', '07', '08', '09'].includes(cst);
}

/**
 * Calculadora de PIS/COFINS (regime antigo). Vigência: até dezembro/2026, encerrada
 * em 01/01/2027 pela Reforma (LC 214/2025). O motor consulta o parâmetro
 * `pis_cofins.encerramento` para decidir se ainda aplica na data da operação.
 *
 * Modos suportados:
 *  - Padrão: base × aliquota
 *  - Por unidade: qtd × vUnid (combustíveis, monofásico)
 *
 * CST cumulativo (regime presumido): geralmente 0,65% PIS + 3% COFINS.
 * CST não-cumulativo (regime real): 1,65% PIS + 7,6% COFINS.
 * Os valores reais vêm da regra do produto (PRD: tributação como dados).
 *
 * Base (modo padrão): valor do item − desconto + frete/seguro/outras − ICMS destacado no
 * item. A exclusão do ICMS segue o Tema 69 do STF (RE 574.706 — "o ICMS não compõe a base
 * de cálculo do PIS e da COFINS"), considerando o ICMS destacado na nota (vICMS, já líquido
 * de diferimento). ICMS-ST, DIFAL e FCP não são excluídos. Ajuste manual de base prevalece.
 */
@injectable()
export class CalculadoraPisCofins implements ICalculadoraTributo {
  readonly nome = 'pis-cofins';

  constructor(
    @inject('TaxParameterRepository')
    private readonly taxParam: ITaxParameterRepository,
  ) {}

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    return this.motivoNaoAplica(contexto, item) === null;
  }

  motivoNaoAplica(_contexto: ContextoCalculo, item: ItemContexto): string | null {
    return item.taxRule.cstPis || item.taxRule.cstCofins
      ? null
      : 'Produto sem CST de PIS/COFINS na regra tributária';
  }

  async calcular(
    contexto: ContextoCalculo,
    item: ItemContexto,
    parcial?: Readonly<ResultadoCalculoItem>,
  ): Promise<CalculadoraSlice> {
    const warnings: string[] = [];

    const encerramento = await this.taxParam.findActiveAt(
      'pis_cofins.encerramento',
      contexto.empresa.companyId,
      contexto.dataOperacao,
    );
    if (encerramento) {
      const dataExtincao = new Date(
        (encerramento.valor as { dataExtincao: string }).dataExtincao,
      );
      if (contexto.dataOperacao >= dataExtincao) {
        return {
          campos: {},
          passo: {
            calculadora: this.nome,
            resumo: 'PIS/COFINS não calculado — extintos pela Reforma',
            detalhe: { dataExtincao: dataExtincao.toISOString() },
          },
          warnings,
        };
      }
    }

    const rule = item.taxRule;
    const passos: string[] = [];
    const detalhe: Record<string, string | number | boolean | null> = {};
    const campos: CalculadoraSlice['campos'] = {};

    // Tema 69/STF: ICMS destacado no item sai da base (nunca abaixo de zero).
    const icmsExcluido = parcial?.valorIcms ? new Money(parcial.valorIcms) : Money.zero();
    let base = baseDefaultItem(item).sub(icmsExcluido);
    if (!base.isPositive()) base = Money.zero();
    if (!icmsExcluido.isZero() && !rule.pisCofinsPorUnidade) {
      detalhe.icmsExcluidoDaBase = icmsExcluido.toString(2);
      passos.push(`base sem ICMS (−R$ ${icmsExcluido.toString(2)}, Tema 69/STF)`);
    }

    if (rule.pisCofinsPorUnidade) {
      const qtd = new Money(item.quantidade);
      if (rule.vUnidPis) {
        const valor = qtd.mul(rule.vUnidPis);
        campos.basePis = qtd.round(2).toString(2);
        campos.aliqPis = '0.0000';
        campos.valorPis = valor.round(2).toString(2);
        passos.push(`PIS por unidade: ${item.quantidade} × R$ ${rule.vUnidPis}`);
        detalhe.pisModo = 'unidade';
      }
      if (rule.vUnidCofins) {
        const valor = qtd.mul(rule.vUnidCofins);
        campos.baseCofins = qtd.round(2).toString(2);
        campos.aliqCofins = '0.0000';
        campos.valorCofins = valor.round(2).toString(2);
        passos.push(`COFINS por unidade: ${item.quantidade} × R$ ${rule.vUnidCofins}`);
        detalhe.cofinsModo = 'unidade';
      }
    } else {
      // Valor = base arredondada × alíquota (o que o XML mostra em vBC × pPIS/pCOFINS).
      // CST 04–09 vai no grupo NT (sem valores): calcular faria o total divergir do item.
      const ajPis = item.ajustes?.pis;
      const aliqPis = cstNaoTributado(rule.cstPis)
        ? null
        : ajusteOu(ajPis?.aliquota, rule.aliqPis ? new Money(rule.aliqPis) : null);
      if (aliqPis) {
        const basePis = ajusteOu(ajPis?.base, base).round(2);
        const manual = temAjuste(ajPis);
        campos.basePis = basePis.toString(2);
        campos.aliqPis = aliqPis.round(4).toString(4);
        campos.valorPis = basePis.applyPercent(aliqPis).round(2).toString(2);
        passos.push(`PIS: base × ${aliqPis.toString(4)}%${manual ? ' (ajustado manualmente)' : ''}`);
        detalhe.pisAliq = aliqPis.toString(4);
        if (manual) detalhe.pisAjusteManual = true;
      }
      const ajCofins = item.ajustes?.cofins;
      const aliqCofins = cstNaoTributado(rule.cstCofins)
        ? null
        : ajusteOu(ajCofins?.aliquota, rule.aliqCofins ? new Money(rule.aliqCofins) : null);
      if (aliqCofins) {
        const baseCofins = ajusteOu(ajCofins?.base, base).round(2);
        const manual = temAjuste(ajCofins);
        campos.baseCofins = baseCofins.toString(2);
        campos.aliqCofins = aliqCofins.round(4).toString(4);
        campos.valorCofins = baseCofins.applyPercent(aliqCofins).round(2).toString(2);
        passos.push(
          `COFINS: base × ${aliqCofins.toString(4)}%${manual ? ' (ajustado manualmente)' : ''}`,
        );
        detalhe.cofinsAliq = aliqCofins.toString(4);
        if (manual) detalhe.cofinsAjusteManual = true;
      }
    }

    return {
      campos,
      passo: passos.length
        ? {
            calculadora: this.nome,
            resumo: passos.join(' · '),
            detalhe,
          }
        : null,
      warnings,
    };
  }
}

import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { baseDefaultItem } from '../domain/item-utils';
import { ITaxParameterRepository } from '../repositories/ITaxParameterRepository';

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
 */
@injectable()
export class CalculadoraPisCofins implements ICalculadoraTributo {
  readonly nome = 'pis-cofins';

  constructor(
    @inject('TaxParameterRepository')
    private readonly taxParam: ITaxParameterRepository,
  ) {}

  aplica(_contexto: ContextoCalculo, item: ItemContexto): boolean {
    return Boolean(item.taxRule.cstPis || item.taxRule.cstCofins);
  }

  async calcular(contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice> {
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
    const base = baseDefaultItem(item);
    const passos: string[] = [];
    const detalhe: Record<string, string | number | boolean | null> = {};
    const campos: CalculadoraSlice['campos'] = {};

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
      if (rule.aliqPis) {
        const aliq = new Money(rule.aliqPis);
        const valor = base.applyPercent(aliq);
        campos.basePis = base.round(2).toString(2);
        campos.aliqPis = aliq.round(4).toString(4);
        campos.valorPis = valor.round(2).toString(2);
        passos.push(`PIS: base × ${aliq.toString(4)}%`);
        detalhe.pisAliq = aliq.toString(4);
      }
      if (rule.aliqCofins) {
        const aliq = new Money(rule.aliqCofins);
        const valor = base.applyPercent(aliq);
        campos.baseCofins = base.round(2).toString(2);
        campos.aliqCofins = aliq.round(4).toString(4);
        campos.valorCofins = valor.round(2).toString(2);
        passos.push(`COFINS: base × ${aliq.toString(4)}%`);
        detalhe.cofinsAliq = aliq.toString(4);
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

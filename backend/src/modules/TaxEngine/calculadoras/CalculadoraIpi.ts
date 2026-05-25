import { injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { baseDefaultItem } from '../domain/item-utils';

/**
 * Calculadora de IPI. Suporta dois modos:
 *  - Padrão: valor = base × aliqIpi
 *  - Por unidade: valor = quantidade × vUnidIpi (cigarros, bebidas, IPI ad valorem)
 *
 * Apenas empresas com `usaIpi = true` rodam — caso típico de indústria/equiparada.
 *
 * IPI suspenso/isento/não-tributado: o CST em si controla o que vai no XML; o motor
 * apenas computa quando há alíquota efetiva (> 0).
 */
@injectable()
export class CalculadoraIpi implements ICalculadoraTributo {
  readonly nome = 'ipi';

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    if (!contexto.empresa.flags.usaIpi) return false;
    return Boolean(item.taxRule.cstIpi);
  }

  async calcular(_contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice> {
    const rule = item.taxRule;
    const warnings: string[] = [];

    if (rule.ipiPorUnidade) {
      if (!rule.vUnidIpi) {
        warnings.push('IPI marcado como por unidade mas vUnidIpi ausente');
        return { campos: {}, warnings };
      }
      const valor = new Money(item.quantidade).mul(rule.vUnidIpi);
      return {
        campos: {
          baseIpi: new Money(item.quantidade).round(2).toString(2),
          aliqIpi: '0.0000',
          valorIpi: valor.round(2).toString(2),
        },
        passo: {
          calculadora: this.nome,
          resumo: `IPI por unidade: ${item.quantidade} × R$ ${rule.vUnidIpi}`,
          detalhe: { modo: 'unidade', qtde: item.quantidade, vUnidIpi: rule.vUnidIpi },
        },
        warnings,
      };
    }

    if (!rule.aliqIpi) {
      // CST de IPI presente mas sem alíquota → CST de não-tributação (ex.: 53, 54, 55).
      return {
        campos: {},
        passo: {
          calculadora: this.nome,
          resumo: `IPI CST ${rule.cstIpi} sem alíquota — não tributado`,
          detalhe: { cstIpi: rule.cstIpi },
        },
        warnings,
      };
    }

    const base = baseDefaultItem(item);
    const aliq = new Money(rule.aliqIpi);
    const valor = base.applyPercent(aliq);
    return {
      campos: {
        baseIpi: base.round(2).toString(2),
        aliqIpi: aliq.round(4).toString(4),
        valorIpi: valor.round(2).toString(2),
      },
      passo: {
        calculadora: this.nome,
        resumo: `IPI padrão: base × ${aliq.toString(4)}%`,
        detalhe: { modo: 'percentual', base: base.round(2).toString(2), aliq: aliq.toString(4) },
      },
      warnings,
    };
  }
}

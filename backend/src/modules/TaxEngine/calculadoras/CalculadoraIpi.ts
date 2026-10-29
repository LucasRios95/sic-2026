import { injectable } from 'tsyringe';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { ajusteOu, baseDefaultItem, temAjuste } from '../domain/item-utils';

/** CSTs de IPI cujo grupo é IPITrib (com vBC/pIPI/vIPI) — mesma regra do NFeXmlBuilder. */
const CST_IPI_TRIBUTADO = ['00', '49', '50', '99'];

/**
 * Calculadora de IPI. Suporta dois modos:
 *  - Padrão: valor = base × aliqIpi
 *  - Por unidade: valor = quantidade × vUnidIpi (cigarros, bebidas, IPI ad valorem)
 *
 * Apenas empresas do Regime Normal com `usaIpi = true` rodam — caso típico de
 * indústria/equiparada. Simples Nacional não destaca IPI (o builder suprime o grupo no
 * item); calcular aqui faria o vIPI/vNF do total divergir dos itens.
 *
 * IPI suspenso/isento/não-tributado: o CST em si controla o que vai no XML; o motor
 * apenas computa quando há alíquota efetiva (> 0).
 *
 * Ajustes manuais (`item.ajustes.ipi`) valem só no modo percentual.
 */
@injectable()
export class CalculadoraIpi implements ICalculadoraTributo {
  readonly nome = 'ipi';

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    if (!contexto.empresa.flags.usaIpi) return false;
    if (contexto.empresa.crt !== CodigoRegimeTributario.REGIME_NORMAL) return false;
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

    const ajuste = item.ajustes?.ipi;
    // Só CST tributado (IPITrib) leva vIPI no XML; nos demais (IPINT) um valor calculado
    // iria para o vIPI/vNF do total sem existir no item.
    const tributado = CST_IPI_TRIBUTADO.includes(rule.cstIpi ?? '');
    const aliqResolvida = rule.aliqIpi ? new Money(rule.aliqIpi) : null;
    const aliq = tributado ? ajusteOu(ajuste?.aliquota, aliqResolvida) : null;
    if (!aliq) {
      // CST de IPI presente mas sem alíquota → CST de não-tributação (ex.: 53, 54, 55).
      return {
        campos: {},
        passo: {
          calculadora: this.nome,
          resumo: `IPI CST ${rule.cstIpi} sem alíquota — não tributado`,
          detalhe: { cstIpi: rule.cstIpi ?? null },
        },
        warnings,
      };
    }

    const base = ajusteOu(ajuste?.base, baseDefaultItem(item)).round(2);
    const valor = base.applyPercent(aliq);
    const manual = temAjuste(ajuste);
    return {
      campos: {
        baseIpi: base.toString(2),
        aliqIpi: aliq.round(4).toString(4),
        valorIpi: valor.round(2).toString(2),
      },
      passo: {
        calculadora: this.nome,
        resumo: `IPI padrão: base × ${aliq.toString(4)}%${manual ? ' (ajustado manualmente)' : ''}`,
        detalhe: {
          modo: 'percentual',
          base: base.toString(2),
          aliq: aliq.toString(4),
          ajusteManual: manual,
        },
      },
      warnings,
    };
  }
}

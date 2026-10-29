import { inject, injectable } from 'tsyringe';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { ajusteOu, baseDefaultItem, temAjuste } from '../domain/item-utils';
import { ITaxParameterRepository } from '../repositories/ITaxParameterRepository';

/** Chave do parâmetro com a alíquota do crédito (por empresa, muda com a faixa de receita). */
export const PARAM_CREDITO_SIMPLES = 'simples.credito_icms.aliquota';

/** CSOSNs que permitem crédito de ICMS ao adquirente. 101/201 obrigam; 900 é opcional. */
const CSOSN_COM_CREDITO = ['101', '201', '900'];

/**
 * Crédito de ICMS do Simples Nacional (LC 123/2006, art. 23; Res. CGSN 140/2018, art. 59):
 * a ME/EPP que vende a contribuinte pode transferir crédito de ICMS, destacado nos campos
 * pCredSN / vCredICMSSN do grupo ICMSSN101/201/900.
 *
 *   pCredSN      = % de ICMS da faixa de receita do Simples em que a empresa está (Anexo I/II)
 *   vCredICMSSN  = valor da operação × pCredSN
 *
 * A alíquota é dado da EMPRESA e muda conforme a receita bruta dos últimos 12 meses — vem do
 * parâmetro `simples.credito_icms.aliquota` (Parâmetros tributários, escopo empresa, com
 * vigência mensal). O crédito NÃO entra no vICMS nem no total da nota; quando > 0, a
 * emissão anexa ao infCpl o texto exigido pelo art. 59 da Res. CGSN 140/2018.
 *
 * Ajuste manual (`item.ajustes.creditoSn`): base e/ou alíquota.
 */
@injectable()
export class CalculadoraCreditoSimples implements ICalculadoraTributo {
  readonly nome = 'credito-sn';

  constructor(
    @inject('TaxParameterRepository')
    private readonly taxParam: ITaxParameterRepository,
  ) {}

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    return this.motivoNaoAplica(contexto, item) === null;
  }

  motivoNaoAplica(contexto: ContextoCalculo, item: ItemContexto): string | null {
    if (contexto.empresa.crt === CodigoRegimeTributario.REGIME_NORMAL) {
      return 'Só para empresa do Simples Nacional';
    }
    const csosn = item.taxRule.csosnIcms;
    return CSOSN_COM_CREDITO.includes(csosn ?? '')
      ? null
      : `CSOSN ${csosn ?? '(vazio)'} sem permissão de crédito`;
  }

  async calcular(contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice> {
    const ajuste = item.ajustes?.creditoSn;
    const manual = temAjuste(ajuste);
    const csosn = item.taxRule.csosnIcms!;
    const warnings: string[] = [];

    const param = await this.taxParam.findActiveAt(
      PARAM_CREDITO_SIMPLES,
      contexto.empresa.companyId,
      contexto.dataOperacao,
    );
    const aliqParam = (param?.valor as { aliquota?: string | number } | undefined)?.aliquota;
    const aliqResolvida =
      aliqParam !== undefined && aliqParam !== null && aliqParam !== ''
        ? new Money(aliqParam)
        : null;
    const aliq = ajusteOu(ajuste?.aliquota, aliqResolvida);

    if (!aliq) {
      // No 900 o crédito é opcional; no 101/201 é obrigatório e sairia zerado.
      if (csosn !== '900') {
        warnings.push(
          `CSOSN ${csosn} exige alíquota de crédito do Simples — cadastre "Crédito de ICMS do ` +
            'Simples" em Parâmetros tributários (escopo da empresa) ou ajuste no modal "Impostos". ' +
            'Sem ela o crédito sai zerado.',
        );
      }
      return { campos: {}, warnings };
    }

    const base = ajusteOu(ajuste?.base, baseDefaultItem(item)).round(2);
    const valor = base.applyPercent(aliq).round(2);
    return {
      campos: {
        baseCredSN: base.toString(2),
        pCredSN: aliq.round(4).toString(4),
        valorCredSN: valor.toString(2),
      },
      passo: {
        calculadora: this.nome,
        resumo:
          `Crédito ICMS Simples (CSOSN ${csosn}): base × ${aliq.round(4).toString(4)}%` +
          (manual ? ' (ajustado manualmente)' : ''),
        detalhe: {
          csosn,
          base: base.toString(2),
          aliquota: aliq.round(4).toString(4),
          fonte: ajuste?.aliquota ? 'ajuste-manual' : 'parametro-empresa',
          ajusteManual: manual,
        },
      },
      warnings,
    };
  }
}

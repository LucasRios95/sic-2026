import { inject, injectable } from 'tsyringe';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { baseDefaultItem } from '../domain/item-utils';
import { ResultadoCalculoItem } from '../domain/ResultadoCalculo';
import { ITaxParameterRepository } from '../repositories/ITaxParameterRepository';

/** Alíquota efetiva do DAS da empresa do Simples (por empresa, vigência mensal). */
export const PARAM_ALIQUOTA_EFETIVA_SIMPLES = 'simples.aliquota_efetiva';

/**
 * Valor aproximado dos tributos — Lei 12.741/2012 ("Lei da Transparência"), regulamentada
 * pelo Decreto 8.264/2014. Preenche `vTotTrib` por item e no total, só em venda a
 * CONSUMIDOR FINAL (escopo da lei). Roda por último no pipeline: soma o que as demais
 * calculadoras já apuraram.
 *
 * Fonte: cálculo próprio a partir dos tributos efetivamente calculados na nota — a lei
 * admite apuração pelo próprio estabelecimento (alternativa à tabela do IBPT). Só entram
 * os tributos da lista do art. 1º, §5º (IR/CSLL foram vetados):
 *   - Regime Normal:  federais = IPI + PIS + COFINS (+ CBS/IS na vigência plena)
 *                     estaduais = ICMS + ICMS-ST + FCP + DIFAL + FCP destino (+ IBS pleno)
 *   - Simples Nacional (Decreto 8.264/2014 permite à ME/EPP informar só a alíquota do
 *     regime, somada a IPI e ST): alíquota efetiva do DAS sobre o valor
 *     do item (parâmetro `simples.aliquota_efetiva`) + ICMS-ST + IPI + DIFAL/FCP destino.
 *     O DAS não é segregado por ente aqui — fica tudo no total.
 * IBS/CBS do ano-teste 2026 NÃO entram: não há recolhimento, não influem no preço.
 */
@injectable()
export class CalculadoraTributosAproximados implements ICalculadoraTributo {
  readonly nome = 'tributos-aproximados';

  constructor(
    @inject('TaxParameterRepository')
    private readonly taxParam: ITaxParameterRepository,
  ) {}

  aplica(contexto: ContextoCalculo, _item: ItemContexto): boolean {
    return contexto.destinatario.consumidorFinal;
  }

  async calcular(
    contexto: ContextoCalculo,
    item: ItemContexto,
    parcial?: Readonly<ResultadoCalculoItem>,
  ): Promise<CalculadoraSlice> {
    const warnings: string[] = [];
    const v = (campo: keyof ResultadoCalculoItem): Money => {
      const raw = parcial?.[campo];
      return typeof raw === 'string' && raw !== '' ? new Money(raw) : Money.zero();
    };
    const reformaPlena = parcial?.modoAnoTesteIbsCbs === false;
    const simples = contexto.empresa.crt !== CodigoRegimeTributario.REGIME_NORMAL;

    const st = v('valorIcmsST');
    const ipi = v('valorIpi');
    const partilhaDestino = v('valorICMSUFDest').add(v('valorFCPUFDest'));

    if (simples) {
      const param = await this.taxParam.findActiveAt(
        PARAM_ALIQUOTA_EFETIVA_SIMPLES,
        contexto.empresa.companyId,
        contexto.dataOperacao,
      );
      const aliqRaw = (param?.valor as { aliquota?: string | number } | undefined)?.aliquota;
      let das = Money.zero();
      if (aliqRaw !== undefined && aliqRaw !== null && aliqRaw !== '') {
        das = baseDefaultItem(item).applyPercent(aliqRaw).round(2);
      } else {
        warnings.push(
          'Alíquota efetiva do Simples não cadastrada (Parâmetros tributários) — o valor ' +
            'aproximado dos tributos (Lei 12.741) considera só ST/IPI/DIFAL.',
        );
      }
      const total = das.add(st).add(ipi).add(partilhaDestino).round(2);
      return {
        campos: { valorTotTrib: total.toString(2) },
        passo: {
          calculadora: this.nome,
          resumo: `Tributos aprox. (Lei 12.741): DAS R$ ${das.toString(2)} + ST/IPI/DIFAL`,
          detalhe: {
            regime: 'SIMPLES',
            das: das.toString(2),
            aliquotaEfetiva: aliqRaw !== undefined ? String(aliqRaw) : null,
          },
        },
        warnings,
      };
    }

    let federal = ipi.add(v('valorPis')).add(v('valorCofins'));
    let estadual = v('valorIcms').add(st).add(v('valorFCP')).add(partilhaDestino);
    if (reformaPlena) {
      federal = federal.add(v('valorCbs')).add(v('valorIs'));
      estadual = estadual.add(v('valorIbs'));
    }
    federal = federal.round(2);
    estadual = estadual.round(2);
    const total = federal.add(estadual);

    return {
      campos: {
        valorTotTrib: total.toString(2),
        valorTotTribFederal: federal.toString(2),
        valorTotTribEstadual: estadual.toString(2),
      },
      passo: {
        calculadora: this.nome,
        resumo: `Tributos aprox. (Lei 12.741): federais R$ ${federal.toString(2)} + estaduais R$ ${estadual.toString(2)}`,
        detalhe: {
          regime: 'NORMAL',
          federal: federal.toString(2),
          estadual: estadual.toString(2),
          incluiReforma: reformaPlena,
        },
      },
      warnings,
    };
  }
}

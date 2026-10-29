import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';
import { IndicadorIE } from '@shared/types/fiscal-enums';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { ajusteOu, baseDefaultItem, isImportado, temAjuste } from '../domain/item-utils';
import { ResultadoCalculoItem } from '../domain/ResultadoCalculo';
import { IIcmsInternaUfRepository } from '../repositories/IIcmsInternaUfRepository';
import { IInterstateAliquotRepository } from '../repositories/IInterstateAliquotRepository';
import { ITaxParameterRepository } from '../repositories/ITaxParameterRepository';

/**
 * Grupo ICMSUFDest só existe para interestadual com consumidor final NÃO contribuinte
 * (idDest=2, indFinal=1, indIEDest=9). Para contribuinte (uso/consumo) o DIFAL é
 * recolhido pelo próprio destinatário e informar o grupo é rejeição.
 */
/** Por que a operação não tem partilha com a UF destino (null = tem). */
function motivoSemPartilhaUfDestino(contexto: ContextoCalculo): string | null {
  if (contexto.empresa.uf === contexto.destinatario.uf) return 'Operação interna';
  if (!contexto.destinatario.consumidorFinal) return 'Destinatário não é consumidor final';
  if (contexto.destinatario.indicadorIE !== IndicadorIE.NAO_CONTRIBUINTE) {
    return 'Destinatário contribuinte do ICMS';
  }
  return null;
}

/** Base do DIFAL/FCP destino: valor da operação + IPI (consumidor final sempre o suporta). */
function baseUfDestino(item: ItemContexto, parcial?: Readonly<ResultadoCalculoItem>): Money {
  return baseDefaultItem(item).add(parcial?.valorIpi ?? 0);
}

/**
 * Calculadora do DIFAL (Diferencial de Alíquotas) em operações INTERESTADUAIS para
 * CONSUMIDOR FINAL NÃO CONTRIBUINTE — EC 87/2015 e LC 190/2022.
 *
 * Aplicabilidade:
 *  - operação cruza fronteiras estaduais (uf origem ≠ uf destino)
 *  - destinatário é consumidor final (indFinal = 1) e não contribuinte (indIEDest = 9)
 *  - empresa tem `usaDifal = true`
 *
 * Cálculo padrão — "base única" (Convênio ICMS 236/2021, cl. 3ª):
 *   baseICMSUFDest   = valor da operação + IPI
 *   pICMSInter       = alíquota interestadual (4% importado / 7% / 12%)
 *   pICMSUFDest      = alíquota interna da UF de destino
 *   valorICMSUFDest  = base × (pICMSUFDest − pICMSInter)
 *
 * "Base dupla" (ICMS por dentro com a alíquota interna do destino), para as UFs que a
 * exigem por lei estadual — ligada por UF no parâmetro `difal.base_dupla.uf.<UF>`
 * (Parâmetros tributários). Não há lista oficial consolidada e as UFs mudam; por isso é
 * dado configurável, não código:
 *   ICMS origem      = vOp × pICMSInter
 *   baseICMSUFDest   = (vOp − ICMS origem) ÷ (1 − pICMSUFDest)
 *   valorICMSUFDest  = baseICMSUFDest × pICMSUFDest − ICMS origem
 * O divisor usa só a alíquota interna (sem FCP). Base digitada no ajuste manual é tomada
 * como a base final do destino (dispensa a fórmula).
 *
 * Quando o destinatário é CONTRIBUINTE, o DIFAL é recolhido por ele em outra apuração;
 * portanto, o motor não calcula (o XML não traz o grupo). Quando NÃO-contribuinte,
 * o emitente recolhe a parcela da UF destino.
 *
 * FCP destino é tratado por uma calculadora separada (CalculadoraFcpDestino) para manter
 * SRP estrito.
 */
@injectable()
export class CalculadoraDifal implements ICalculadoraTributo {
  readonly nome = 'difal';

  constructor(
    @inject('InterstateAliquotRepository')
    private readonly interstate: IInterstateAliquotRepository,

    @inject('IcmsInternaUfRepository')
    private readonly icmsInterna: IIcmsInternaUfRepository,

    @inject('TaxParameterRepository')
    private readonly taxParam: ITaxParameterRepository,
  ) {}

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    return this.motivoNaoAplica(contexto, item) === null;
  }

  motivoNaoAplica(contexto: ContextoCalculo, _item: ItemContexto): string | null {
    if (!contexto.empresa.flags.usaDifal) return 'DIFAL desligado na configuração da empresa';
    return motivoSemPartilhaUfDestino(contexto);
  }

  /** A UF de destino exige base dupla? Parâmetro por UF (empresa sobrescreve o global). */
  private async usaBaseDupla(contexto: ContextoCalculo): Promise<boolean> {
    const param = await this.taxParam.findActiveAt(
      `difal.base_dupla.uf.${contexto.destinatario.uf}`,
      contexto.empresa.companyId,
      contexto.dataOperacao,
    );
    if (!param) return false;
    return (param.valor as { ativo?: boolean } | null)?.ativo !== false;
  }

  async calcular(
    contexto: ContextoCalculo,
    item: ItemContexto,
    parcial?: Readonly<ResultadoCalculoItem>,
  ): Promise<CalculadoraSlice> {
    const ajuste = item.ajustes?.difal;
    const manual = temAjuste(ajuste);
    const ufOrigem = contexto.empresa.uf;
    const ufDestino = contexto.destinatario.uf;
    const warnings: string[] = [];

    let pIcmsUfDest: Money;
    if (ajuste?.aliquotaDestino) {
      pIcmsUfDest = new Money(ajuste.aliquotaDestino);
    } else {
      const interna = await this.icmsInterna.findActiveAt(ufDestino, contexto.dataOperacao);
      if (!interna) {
        warnings.push(`Sem alíquota interna para destino ${ufDestino} — DIFAL não calculado`);
        return { campos: {}, warnings };
      }
      pIcmsUfDest = new Money(interna.aliqInterna);
    }

    let pIcmsInter: Money;
    if (ajuste?.aliquotaInterestadual) {
      pIcmsInter = new Money(ajuste.aliquotaInterestadual);
    } else if (isImportado(item.origem)) {
      pIcmsInter = new Money('4');
    } else {
      const inter = await this.interstate.findActiveAt(ufOrigem, ufDestino, contexto.dataOperacao);
      if (!inter) {
        warnings.push(`Sem alíquota interestadual ${ufOrigem}→${ufDestino} — DIFAL não calculado`);
        return { campos: {}, warnings };
      }
      pIcmsInter = new Money(inter.aliqNacional);
    }

    let diff = pIcmsUfDest.sub(pIcmsInter);
    if (!diff.isPositive()) diff = Money.zero();

    const valorOperacao = baseUfDestino(item, parcial).round(2);
    const baseDupla = !ajuste?.base && (await this.usaBaseDupla(contexto));
    let base: Money;
    let valor: Money;
    let icmsOrigem: Money | null = null;
    if (baseDupla && pIcmsUfDest.toNumber() < 100) {
      icmsOrigem = valorOperacao.applyPercent(pIcmsInter).round(2);
      const divisor = new Money('1').sub(pIcmsUfDest.div(100));
      base = valorOperacao.sub(icmsOrigem).div(divisor).round(2);
      valor = base.applyPercent(pIcmsUfDest).round(2).sub(icmsOrigem);
      if (!valor.isPositive()) valor = Money.zero();
    } else {
      base = ajusteOu(ajuste?.base, valorOperacao).round(2);
      valor = base.applyPercent(diff).round(2);
    }

    return {
      campos: {
        baseICMSUFDest: base.toString(2),
        pICMSUFDest: pIcmsUfDest.round(4).toString(4),
        pICMSInter: pIcmsInter.round(4).toString(4),
        valorICMSUFDest: valor.toString(2),
        valorICMSUFRemet: '0.00',
      },
      passo: {
        calculadora: this.nome,
        resumo:
          (icmsOrigem
            ? `DIFAL base dupla (${ufDestino}): (vOp − R$ ${icmsOrigem.toString(2)}) ÷ (1 − ${pIcmsUfDest.toString(4)}%) = base R$ ${base.toString(2)}; base × ${pIcmsUfDest.toString(4)}% − ICMS origem`
            : `DIFAL base única: base × (${pIcmsUfDest.toString(4)}% − ${pIcmsInter.toString(4)}%)`) +
          (manual ? ' (ajustado manualmente)' : ''),
        detalhe: {
          ufOrigem,
          ufDestino,
          consumidorFinal: contexto.destinatario.consumidorFinal,
          metodo: icmsOrigem ? 'BASE_DUPLA' : 'BASE_UNICA',
          valorOperacao: valorOperacao.toString(2),
          icmsOrigem: icmsOrigem ? icmsOrigem.toString(2) : null,
          pICMSInter: pIcmsInter.round(4).toString(4),
          pICMSUFDest: pIcmsUfDest.round(4).toString(4),
          diferencial: diff.round(4).toString(4),
          ajusteManual: manual,
        },
      },
      warnings,
    };
  }
}

/**
 * Calculadora do FCP DESTINO — adicional cobrado pela UF de destino em operações
 * interestaduais com consumidor final, sobre certos produtos.
 *
 * Aplicabilidade: mesma do DIFAL + a UF de destino tem `aliq_fcp` cadastrada
 * E o produto não tem cadastro próprio que desabilite (`pFCP === '0'` explicit).
 */
@injectable()
export class CalculadoraFcpDestino implements ICalculadoraTributo {
  readonly nome = 'fcp-destino';

  constructor(
    @inject('IcmsInternaUfRepository')
    private readonly icmsInterna: IIcmsInternaUfRepository,
  ) {}

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    return this.motivoNaoAplica(contexto, item) === null;
  }

  motivoNaoAplica(contexto: ContextoCalculo, _item: ItemContexto): string | null {
    if (!contexto.empresa.flags.usaFcp) return 'FCP desligado na configuração da empresa';
    return motivoSemPartilhaUfDestino(contexto);
  }

  async calcular(
    contexto: ContextoCalculo,
    item: ItemContexto,
    parcial?: Readonly<ResultadoCalculoItem>,
  ): Promise<CalculadoraSlice> {
    const ufDestino = contexto.destinatario.uf;
    const warnings: string[] = [];
    const aliqAjustada = item.ajustes?.fcpDestino?.aliquota;

    // O FCP destino vive dentro do grupo ICMSUFDest, que o XML só emite junto do DIFAL.
    // Sem DIFAL, o vFCPUFDest iria para o total sem existir no item.
    if (!parcial?.valorICMSUFDest) {
      warnings.push('FCP destino não calculado: DIFAL do item não foi apurado');
      return { campos: {}, warnings };
    }

    let pFcp: Money;
    if (aliqAjustada) {
      pFcp = new Money(aliqAjustada);
    } else {
      const interna = await this.icmsInterna.findActiveAt(ufDestino, contexto.dataOperacao);
      if (!interna?.aliqFcp) {
        // UF não instituiu FCP — não é erro, só não calcula.
        return { campos: {}, warnings };
      }
      pFcp = new Money(interna.aliqFcp);
    }
    // FCP destino incide sobre a mesma base do DIFAL (inclusive quando ajustada à mão).
    const base = parcial?.baseICMSUFDest
      ? new Money(parcial.baseICMSUFDest)
      : baseUfDestino(item, parcial).round(2);
    const valor = base.applyPercent(pFcp);

    return {
      campos: {
        baseFCPUFDest: base.toString(2),
        pFCPUFDest: pFcp.round(4).toString(4),
        valorFCPUFDest: valor.round(2).toString(2),
      },
      passo: {
        calculadora: this.nome,
        resumo:
          `FCP destino ${ufDestino}: base × ${pFcp.toString(4)}%` +
          (aliqAjustada ? ' (ajustado manualmente)' : ''),
        detalhe: { ufDestino, pFCP: pFcp.toString(4), ajusteManual: !!aliqAjustada },
      },
      warnings,
    };
  }
}

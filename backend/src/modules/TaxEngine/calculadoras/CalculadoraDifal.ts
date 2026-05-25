import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { baseDefaultItem, isImportado } from '../domain/item-utils';
import { IIcmsInternaUfRepository } from '../repositories/IIcmsInternaUfRepository';
import { IInterstateAliquotRepository } from '../repositories/IInterstateAliquotRepository';

/**
 * Calculadora do DIFAL (Diferencial de Alíquotas) em operações INTERESTADUAIS para
 * CONSUMIDOR FINAL — EC 87/2015 e LC 190/2022.
 *
 * Aplicabilidade:
 *  - operação cruza fronteiras estaduais (uf origem ≠ uf destino)
 *  - destinatário é consumidor final (indFinal = 1)
 *  - empresa tem `usaDifal = true`
 *
 * Cálculo:
 *   baseICMSUFDest   = base default do item
 *   pICMSInter       = alíquota interestadual (4% importado / 7% / 12%)
 *   pICMSUFDest      = alíquota interna da UF de destino
 *   valorICMSUFDest  = base × (pICMSUFDest − pICMSInter)
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
  ) {}

  aplica(contexto: ContextoCalculo, _item: ItemContexto): boolean {
    if (!contexto.empresa.flags.usaDifal) return false;
    if (!contexto.destinatario.consumidorFinal) return false;
    return contexto.empresa.uf !== contexto.destinatario.uf;
  }

  async calcular(contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice> {
    const ufOrigem = contexto.empresa.uf;
    const ufDestino = contexto.destinatario.uf;
    const warnings: string[] = [];

    const interna = await this.icmsInterna.findActiveAt(ufDestino, contexto.dataOperacao);
    if (!interna) {
      warnings.push(`Sem alíquota interna para destino ${ufDestino} — DIFAL não calculado`);
      return { campos: {}, warnings };
    }

    let pIcmsInter: Money;
    if (isImportado(item.origem)) {
      pIcmsInter = new Money('4');
    } else {
      const inter = await this.interstate.findActiveAt(ufOrigem, ufDestino, contexto.dataOperacao);
      if (!inter) {
        warnings.push(`Sem alíquota interestadual ${ufOrigem}→${ufDestino} — DIFAL não calculado`);
        return { campos: {}, warnings };
      }
      pIcmsInter = new Money(inter.aliqNacional);
    }

    const pIcmsUfDest = new Money(interna.aliqInterna);
    const base = baseDefaultItem(item);
    const diff = pIcmsUfDest.sub(pIcmsInter);
    const valor = base.applyPercent(diff);

    return {
      campos: {
        baseICMSUFDest: base.round(2).toString(2),
        pICMSUFDest: pIcmsUfDest.round(4).toString(4),
        pICMSInter: pIcmsInter.round(4).toString(4),
        valorICMSUFDest: valor.round(2).toString(2),
        valorICMSUFRemet: '0.00',
      },
      passo: {
        calculadora: this.nome,
        resumo: `DIFAL: base × (${pIcmsUfDest.toString(4)}% − ${pIcmsInter.toString(4)}%)`,
        detalhe: {
          ufOrigem,
          ufDestino,
          consumidorFinal: contexto.destinatario.consumidorFinal,
          pICMSInter: pIcmsInter.round(4).toString(4),
          pICMSUFDest: pIcmsUfDest.round(4).toString(4),
          diferencial: diff.round(4).toString(4),
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

  aplica(contexto: ContextoCalculo, _item: ItemContexto): boolean {
    if (!contexto.empresa.flags.usaFcp) return false;
    if (!contexto.destinatario.consumidorFinal) return false;
    return contexto.empresa.uf !== contexto.destinatario.uf;
  }

  async calcular(contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice> {
    const ufDestino = contexto.destinatario.uf;
    const warnings: string[] = [];

    const interna = await this.icmsInterna.findActiveAt(ufDestino, contexto.dataOperacao);
    if (!interna?.aliqFcp) {
      // UF não instituiu FCP — não é erro, só não calcula.
      return { campos: {}, warnings };
    }
    const pFcp = new Money(interna.aliqFcp);
    const base = baseDefaultItem(item);
    const valor = base.applyPercent(pFcp);

    return {
      campos: {
        baseFCPUFDest: base.round(2).toString(2),
        pFCPUFDest: pFcp.round(4).toString(4),
        valorFCPUFDest: valor.round(2).toString(2),
      },
      passo: {
        calculadora: this.nome,
        resumo: `FCP destino ${ufDestino}: base × ${pFcp.toString(4)}%`,
        detalhe: { ufDestino, pFCP: pFcp.toString(4) },
      },
      warnings,
    };
  }
}

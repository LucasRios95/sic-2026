import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import {
  ajusteOu,
  baseDefaultItem,
  CSOSN_COM_ST,
  CST_COM_ST,
  isImportado,
  temAjuste,
} from '../domain/item-utils';
import { ResultadoCalculoItem } from '../domain/ResultadoCalculo';
import { IIcmsInternaUfRepository } from '../repositories/IIcmsInternaUfRepository';
import { IIcmsStMvaRepository } from '../repositories/IIcmsStMvaRepository';
import { IInterstateAliquotRepository } from '../repositories/IInterstateAliquotRepository';

/**
 * Calculadora de ICMS-ST.
 *
 * Cenário do remetente (mais comum): a empresa emitente é a SUBSTITUTA — recolhe o
 * ICMS-ST devido nas operações subsequentes. Fórmula consolidada:
 *
 *   1. Base ST = (vProd − desc + IPI + frete + seguro + outras) × (1 + MVA) × (1 − pRedBCST)
 *   2. ICMS-ST = (Base ST × aliq_interna_destino) − ICMS_proprio_da_operacao   (mínimo 0)
 *
 * O ICMS próprio deduzido é o que a CalculadoraIcmsProprio apurou para o item (já com
 * redução de base e ajustes manuais). Quando ela não roda (Simples — CSOSN 201/202/203 —
 * ou CST 30), recompõe-se o ICMS da operação pela alíquota própria, sobre a base sem IPI.
 *
 * Resolução da MVA:
 *   - Se há regra global em `icms_st_mva` para (UF origem, UF destino, NCM), ela prevalece
 *     sobre `ProductTaxRule.pMVAST`. Quando interestadual, prefere MVA ajustada compatível
 *     com a alíquota interestadual (4/7/12%).
 *   - Sem regra global e sem `pMVAST` no produto → avisa e não calcula.
 *
 * Alíquota interna do destino: ajuste manual > `ProductTaxRule.pICMSST` > `icms_interna_uf`.
 *
 * Ajustes manuais (`item.ajustes.icmsSt`): `mva`, `base` (dispensa a MVA) e `aliquota`.
 *
 * Empresas sem `usaIcmsSt` saem cedo via `aplica()`.
 */
@injectable()
export class CalculadoraIcmsSt implements ICalculadoraTributo {
  readonly nome = 'icms-st';

  constructor(
    @inject('IcmsStMvaRepository')
    private readonly stMva: IIcmsStMvaRepository,

    @inject('IcmsInternaUfRepository')
    private readonly icmsInterna: IIcmsInternaUfRepository,

    @inject('InterstateAliquotRepository')
    private readonly interstate: IInterstateAliquotRepository,
  ) {}

  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean {
    return this.motivoNaoAplica(contexto, item) === null;
  }

  motivoNaoAplica(contexto: ContextoCalculo, item: ItemContexto): string | null {
    if (!contexto.empresa.flags.usaIcmsSt) return 'ICMS-ST desligado na configuração da empresa';
    const { csosnIcms, cstIcms, cstIcmsSt } = item.taxRule;
    // Só aplica quando o grupo de ICMS do item comporta ST calculada nesta operação.
    // CSOSN 500 / CST 60 são ST já retida antes: calcular aqui somava vST no total sem
    // existir no item (cStat 534) e inflava o vNF.
    if (csosnIcms) {
      return CSOSN_COM_ST.includes(csosnIcms) ? null : `CSOSN ${csosnIcms} sem ST calculada na nota`;
    }
    if (!cstIcmsSt) return 'Produto sem CST de ICMS-ST na regra tributária';
    return !cstIcms || CST_COM_ST.includes(cstIcms.padStart(2, '0'))
      ? null
      : `CST ${cstIcms} sem ST calculada na nota`;
  }

  async calcular(
    contexto: ContextoCalculo,
    item: ItemContexto,
    parcial?: Readonly<ResultadoCalculoItem>,
  ): Promise<CalculadoraSlice> {
    const ajuste = item.ajustes?.icmsSt;
    const manual = temAjuste(ajuste);
    const ufOrigem = contexto.empresa.uf;
    const ufDestino = contexto.destinatario.uf;
    const interestadual = ufOrigem !== ufDestino;
    const warnings: string[] = [];

    let aliqInternaDestino: Money;
    if (ajuste?.aliquota) {
      aliqInternaDestino = new Money(ajuste.aliquota);
    } else if (item.taxRule.pICMSST) {
      // Alíquota de ST do produto prevalece sobre a padrão da UF (ex.: vinho, 25–30%).
      aliqInternaDestino = new Money(item.taxRule.pICMSST);
    } else {
      const interna = await this.icmsInterna.findActiveAt(ufDestino, contexto.dataOperacao);
      if (!interna) {
        warnings.push(`Sem alíquota interna cadastrada para destino ${ufDestino}`);
        return { campos: {}, warnings };
      }
      aliqInternaDestino = new Money(interna.aliqInterna);
    }

    const baseProduto = baseDefaultItem(item);
    // IPI integra a base da ST como encargo transferível ao adquirente (LC 87/96, art. 8º, II).
    const baseOperacao = baseProduto.add(parcial?.valorIpi ?? 0);
    const pRedBCST = item.taxRule.pRedBCST ? new Money(item.taxRule.pRedBCST) : null;

    let mvaPercent: Money | null = null;
    let baseSt: Money;
    if (ajuste?.base) {
      baseSt = new Money(ajuste.base).round(2);
      mvaPercent = ajuste.mva ? new Money(ajuste.mva) : null;
    } else {
      mvaPercent = ajuste?.mva
        ? new Money(ajuste.mva)
        : await this.resolveMva(
            ufOrigem,
            ufDestino,
            item.ncm,
            item.origem,
            item.taxRule.pMVAST ?? null,
            interestadual,
            contexto.dataOperacao,
            warnings,
          );
      if (!mvaPercent) {
        return { campos: {}, warnings };
      }
      const fatorMva = new Money('1').add(mvaPercent.div(100));
      let base = baseOperacao.mul(fatorMva);
      if (pRedBCST) base = base.mul(new Money('1').sub(pRedBCST.div(100)));
      baseSt = base.round(2);
    }

    // ICMS próprio dessa operação: o já apurado no pipeline (inclui pRedBC e ajustes);
    // senão recompõe pela alíquota própria sobre a base sem IPI.
    let icmsProprio: Money;
    if (parcial?.valorIcms) {
      icmsProprio = new Money(parcial.valorIcms);
    } else {
      const aliqIcmsProprio = await this.resolveAliqIcmsProprio(
        ufOrigem,
        ufDestino,
        interestadual,
        item.origem,
        item.taxRule.aliqIcms ?? null,
        contexto.dataOperacao,
      );
      icmsProprio = baseProduto.applyPercent(aliqIcmsProprio).round(2);
    }

    let icmsSt = baseSt.applyPercent(aliqInternaDestino).sub(icmsProprio).round(2);
    if (!icmsSt.isPositive()) {
      warnings.push(
        'ICMS-ST calculado ficou ≤ 0 (ICMS próprio maior que o ICMS da base ST) — zerado. Confira MVA/alíquotas.',
      );
      icmsSt = Money.zero();
    }

    return {
      campos: {
        baseIcmsST: baseSt.toString(2),
        aliqIcmsST: aliqInternaDestino.round(4).toString(4),
        valorIcmsST: icmsSt.toString(2),
        ...(mvaPercent ? { pMVAST: mvaPercent.round(4).toString(4) } : {}),
        ...(pRedBCST && !ajuste?.base ? { pRedBCST: pRedBCST.round(4).toString(4) } : {}),
        ...(item.taxRule.modBCST !== null && item.taxRule.modBCST !== undefined
          ? { modBCST: item.taxRule.modBCST }
          : {}),
      },
      passo: {
        calculadora: this.nome,
        resumo:
          `ST ${mvaPercent ? `com MVA ${mvaPercent.round(4).toString(4)}%` : 'base informada'} → ` +
          `BaseST × ${aliqInternaDestino.round(4).toString(4)}% − ICMS_próprio` +
          (manual ? ' (ajustado manualmente)' : ''),
        detalhe: {
          ufOrigem,
          ufDestino,
          mva: mvaPercent ? mvaPercent.round(4).toString(4) : null,
          baseProduto: baseProduto.round(2).toString(2),
          ipiNaBase: parcial?.valorIpi ?? null,
          baseSt: baseSt.toString(2),
          aliqInternaDestino: aliqInternaDestino.round(4).toString(4),
          icmsProprio: icmsProprio.toString(2),
          ajusteManual: manual,
        },
      },
      warnings,
    };
  }

  private async resolveMva(
    ufOrigem: string,
    ufDestino: string,
    ncm: string,
    origem: number,
    pMvaProduto: string | null,
    interestadual: boolean,
    dataOperacao: Date,
    warnings: string[],
  ): Promise<Money | null> {
    const global = await this.stMva.findActiveAt(ufOrigem, ufDestino, ncm, dataOperacao);
    if (global) {
      // Em operação interestadual, prefere a MVA ajustada compatível com a alíquota efetiva.
      if (interestadual) {
        if (isImportado(origem) && global.mvaAjustada4) return new Money(global.mvaAjustada4);
        // Resolução do par UF/UF para escolher 7 ou 12%. Como o motor já carrega a alíquota
        // interestadual via outra calculadora, simplificamos: se origem é Sul/Sudeste exc. ES
        // e destino é N/NE/CO/ES, alíquota é 7% → mvaAjustada7. Caso contrário, 12%.
        const sulSudesteExES = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'];
        const aliquota7 =
          sulSudesteExES.includes(ufOrigem) && !sulSudesteExES.includes(ufDestino);
        const ajustada = aliquota7 ? global.mvaAjustada7 : global.mvaAjustada12;
        if (ajustada) return new Money(ajustada);
      }
      return new Money(global.mvaOriginal);
    }
    if (pMvaProduto) return new Money(pMvaProduto);
    warnings.push(
      `Produto NCM ${ncm} sem MVA cadastrada (nem global em icms_st_mva, nem pMVAST no produto)`,
    );
    return null;
  }

  private async resolveAliqIcmsProprio(
    ufOrigem: string,
    ufDestino: string,
    interestadual: boolean,
    origem: number,
    aliqIcmsProduto: string | null,
    dataOperacao: Date,
  ): Promise<Money> {
    if (!interestadual) {
      return new Money(aliqIcmsProduto ?? '0');
    }
    if (isImportado(origem)) return new Money('4');
    const row = await this.interstate.findActiveAt(ufOrigem, ufDestino, dataOperacao);
    return new Money(row?.aliqNacional ?? '0');
  }
}

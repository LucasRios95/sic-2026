import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { ContextoCalculo, ItemContexto } from '../domain/ContextoCalculo';
import { CalculadoraSlice, ICalculadoraTributo } from '../domain/ICalculadoraTributo';
import { baseDefaultItem, isImportado } from '../domain/item-utils';
import { IIcmsInternaUfRepository } from '../repositories/IIcmsInternaUfRepository';
import { IIcmsStMvaRepository } from '../repositories/IIcmsStMvaRepository';
import { IInterstateAliquotRepository } from '../repositories/IInterstateAliquotRepository';

/**
 * Calculadora de ICMS-ST.
 *
 * Cenário do remetente (mais comum): a empresa emitente é a SUBSTITUTA — recolhe o
 * ICMS-ST devido nas operações subsequentes. Fórmula consolidada:
 *
 *   1. Base ST = (vProd + IPI + frete + seguro + outras) × (1 + MVA)
 *   2. ICMS-ST = (Base ST × aliq_interna_destino) − ICMS_proprio_da_operacao
 *
 * Resolução da MVA:
 *   - Se há regra global em `icms_st_mva` para (UF origem, UF destino, NCM), ela prevalece
 *     sobre `ProductTaxRule.pMVAST`. Quando interestadual, prefere MVA ajustada compatível
 *     com a alíquota interestadual (4/7/12%).
 *   - Sem regra global e sem `pMVAST` no produto → avisa e não calcula.
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
    if (!contexto.empresa.flags.usaIcmsSt) return false;
    // Só aplica quando há CST/CSOSN de ST cadastrado no produto.
    return Boolean(item.taxRule.cstIcmsSt || isCstStOuCsosn(item.taxRule.csosnIcms ?? null));
  }

  async calcular(contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice> {
    const ufOrigem = contexto.empresa.uf;
    const ufDestino = contexto.destinatario.uf;
    const interestadual = ufOrigem !== ufDestino;
    const warnings: string[] = [];

    const interna = await this.icmsInterna.findActiveAt(ufDestino, contexto.dataOperacao);
    if (!interna) {
      warnings.push(`Sem alíquota interna cadastrada para destino ${ufDestino}`);
      return { campos: {}, warnings };
    }
    const aliqInternaDestino = new Money(interna.aliqInterna);

    // Resolve a MVA aplicável.
    const mvaPercent = await this.resolveMva(
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

    const baseProduto = baseDefaultItem(item);
    const fatorMva = new Money('1').add(mvaPercent.div(100));
    const baseSt = baseProduto.mul(fatorMva);

    // ICMS próprio dessa operação (precisa ser recalculado aqui — a CalculadoraIcmsProprio
    // roda antes no pipeline mas o slice de saída não chega à ST, então recomputamos).
    const aliqIcmsProprio = await this.resolveAliqIcmsProprio(
      ufOrigem,
      ufDestino,
      interestadual,
      item.origem,
      item.taxRule.aliqIcms ?? null,
      contexto.dataOperacao,
    );
    const icmsProprio = baseProduto.applyPercent(aliqIcmsProprio);
    const icmsSt = baseSt.applyPercent(aliqInternaDestino).sub(icmsProprio);

    return {
      campos: {
        baseIcmsST: baseSt.round(2).toString(2),
        aliqIcmsST: aliqInternaDestino.round(4).toString(4),
        valorIcmsST: icmsSt.round(2).toString(2),
        pMVAST: mvaPercent.round(4).toString(4),
        ...(item.taxRule.modBCST !== null && item.taxRule.modBCST !== undefined
          ? { modBCST: item.taxRule.modBCST }
          : {}),
      },
      passo: {
        calculadora: this.nome,
        resumo: `ST com MVA ${mvaPercent.round(4).toString(4)}% → BaseST × ${aliqInternaDestino.round(4).toString(4)}% − ICMS_próprio`,
        detalhe: {
          ufOrigem,
          ufDestino,
          mva: mvaPercent.round(4).toString(4),
          baseProduto: baseProduto.round(2).toString(2),
          baseSt: baseSt.round(2).toString(2),
          aliqInternaDestino: aliqInternaDestino.round(4).toString(4),
          icmsProprio: icmsProprio.round(2).toString(2),
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

/**
 * CSOSNs do Simples que indicam ST: 201, 202, 203 (com ST), 500 (ST cobrada anteriormente),
 * 900 (outros, podem ter ST).
 */
function isCstStOuCsosn(csosn: string | null): boolean {
  if (!csosn) return false;
  return ['201', '202', '203', '500', '900'].includes(csosn);
}

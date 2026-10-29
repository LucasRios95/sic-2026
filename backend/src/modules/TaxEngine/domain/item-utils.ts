import { Money } from '@shared/domain/Money';

import { ItemContexto } from './ContextoCalculo';

/** Valor bruto do item: qtd × unit. */
export function valorBrutoItem(item: ItemContexto): Money {
  return new Money(item.quantidade).mul(item.valorUnitario);
}

/**
 * Base "do item" para tributos clássicos (ICMS próprio, IBS/CBS).
 * Frete + seguro + outros entram na base; desconto reduz. Esta é a base "padrão" —
 * cálculos específicos (ST, IPI sobre base diferenciada) ajustam a partir daqui.
 */
export function baseDefaultItem(item: ItemContexto): Money {
  return valorBrutoItem(item)
    .add(item.valorFrete ?? 0)
    .add(item.valorSeguro ?? 0)
    .add(item.valorOutros ?? 0)
    .sub(item.valorDesconto ?? 0);
}

/** Origem do produto indica importado (1, 2, 3, 5, 6, 7, 8 — Res. Senado 13/2012). */
export function isImportado(origem: number): boolean {
  return [1, 2, 3, 5, 6, 7, 8].includes(origem);
}

/**
 * CSTs (Regime Normal) cujo grupo no XML leva ICMS próprio (vBC/pICMS/vICMS). Nos demais
 * (30, 40, 41, 50, 60) o grupo não tem esses campos — calcular ICMS ali faz o ICMSTot
 * divergir dos itens (cStat 531/532) ou gera tag inexistente (cStat 225).
 */
export const CST_COM_ICMS_PROPRIO = ['00', '10', '20', '51', '70', '90'];

/** CSTs (Regime Normal) cujo grupo leva ICMS-ST calculado na operação. */
export const CST_COM_ST = ['10', '30', '70', '90'];

/**
 * CSOSNs (Simples) cujo grupo leva ICMS-ST calculado na operação. O 500 é ST JÁ RETIDA
 * anteriormente — não há ST a calcular (o grupo ICMSSN500 nem tem vICMSST).
 */
export const CSOSN_COM_ST = ['201', '202', '203', '900'];

/** Valor digitado no ajuste manual, quando informado; senão o resolvido pela calculadora. */
export function ajusteOu(ajuste: string | undefined, resolvido: Money): Money;
export function ajusteOu(ajuste: string | undefined, resolvido: Money | null): Money | null;
export function ajusteOu(ajuste: string | undefined, resolvido: Money | null): Money | null {
  return ajuste !== undefined && ajuste !== '' ? new Money(ajuste) : resolvido;
}

/** True quando algum campo do ajuste foi informado. */
export function temAjuste(ajuste: object | undefined): boolean {
  return !!ajuste && Object.values(ajuste).some((v) => v !== undefined && v !== '');
}

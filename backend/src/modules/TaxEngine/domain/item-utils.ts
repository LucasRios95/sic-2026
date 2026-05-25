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

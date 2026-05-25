/**
 * Utilitários para validar janelas de vigência [validFrom, validTo).
 *
 * Convenções:
 *  - validFrom é INCLUSIVO
 *  - validTo é EXCLUSIVO (null = janela aberta, vigente até substituição)
 *  - duas janelas se sobrepõem se compartilharem QUALQUER instante
 *
 * Aplicável a ProductTaxRule, ServiceTaxRule, RegraTributaria, TaxParameter e qualquer outra
 * tabela versionada por vigência.
 */

export interface ValidityWindow {
  validFrom: Date;
  validTo?: Date | null;
}

/**
 * Verifica se a janela `incoming` se sobrepõe a qualquer janela em `existing`.
 * O argumento `excludeId` permite ignorar a própria linha durante um update.
 */
export function hasOverlap<T extends ValidityWindow & { id?: string }>(
  incoming: ValidityWindow,
  existing: T[],
  excludeId?: string,
): boolean {
  const incomingStart = incoming.validFrom.getTime();
  const incomingEnd = incoming.validTo ? incoming.validTo.getTime() : Number.POSITIVE_INFINITY;

  if (incomingEnd <= incomingStart) {
    throw new Error('validTo deve ser posterior a validFrom');
  }

  return existing.some((other) => {
    if (excludeId && other.id === excludeId) return false;
    const otherStart = other.validFrom.getTime();
    const otherEnd = other.validTo ? other.validTo.getTime() : Number.POSITIVE_INFINITY;
    // sobreposição: incomingStart < otherEnd AND otherStart < incomingEnd
    return incomingStart < otherEnd && otherStart < incomingEnd;
  });
}

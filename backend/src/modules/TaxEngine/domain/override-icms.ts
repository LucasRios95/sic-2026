import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { BusinessRuleError } from '@shared/errors';

/**
 * Aplica o override de CST/CSOSN do ICMS informado item a item na nota, sobre a regra
 * tributária vigente do produto. Regras:
 *  - Validação por regime: empresa do Simples (CRT 1/2/4) usa CSOSN; Regime Normal (CRT 3)
 *    usa CST. Informar o código do regime errado é rejeitado com mensagem clara.
 *  - Coerência de valores: códigos "sem ICMS próprio" (CSOSN 102/103/300/400/500 e CST
 *    40/41/50/60) zeram a alíquota. Além disso a CalculadoraIcmsProprio não roda para CSTs
 *    sem ICMS próprio no grupo (inclusive em operação interestadual), então o XML sai só
 *    com orig+CST/CSOSN. Os demais mantêm a alíquota da regra (geram vICMS / crédito).
 *
 * Usado na emissão, no simulate (preview tributário) e na prévia do DANFE — os três
 * precisam calcular com o MESMO código, senão a prévia mostra um imposto e a nota sai
 * com outro.
 *
 * Retorna a própria regra (sem clonar) quando o item não traz override.
 */
export function aplicarOverrideIcms<
  T extends { cstIcms?: string | null; csosnIcms?: string | null; aliqIcms?: string | null },
>(
  rule: T,
  item: { cstIcms?: string; csosnIcms?: string },
  crt: CodigoRegimeTributario,
  codigoProduto: string,
): T {
  const cst = item.cstIcms?.trim();
  const csosn = item.csosnIcms?.trim();
  if (!cst && !csosn) return rule;

  const simples = crt !== CodigoRegimeTributario.REGIME_NORMAL;
  if (simples && cst && !csosn) {
    throw new BusinessRuleError(
      `Item ${codigoProduto}: empresa do Simples Nacional usa CSOSN, não CST de ICMS.`,
      'ICMS_CODE_REGIME_MISMATCH',
    );
  }
  if (!simples && csosn && !cst) {
    throw new BusinessRuleError(
      `Item ${codigoProduto}: empresa do Regime Normal usa CST de ICMS, não CSOSN.`,
      'ICMS_CODE_REGIME_MISMATCH',
    );
  }

  const codigo = (simples ? csosn : cst)!;
  const semIcmsProprio = simples
    ? ['102', '103', '300', '400', '500'].includes(codigo)
    : ['40', '41', '50', '60'].includes(codigo);

  return {
    ...rule,
    cstIcms: simples ? null : codigo,
    csosnIcms: simples ? codigo : null,
    aliqIcms: semIcmsProprio ? null : rule.aliqIcms,
  };
}

/**
 * Domínio do CFOP — Código Fiscal de Operações e Prestações (Ajuste Sinief).
 *
 * O primeiro dígito do código (4 dígitos) identifica o tipo + escopo da operação:
 *   1xxx → Entrada estadual (mesma UF do destinatário)
 *   2xxx → Entrada interestadual
 *   3xxx → Entrada do exterior (importação)
 *   5xxx → Saída estadual
 *   6xxx → Saída interestadual
 *   7xxx → Saída para o exterior (exportação)
 */

export enum CfopTipoOperacao {
  ENTRADA = 'ENTRADA',
  SAIDA = 'SAIDA',
}

export enum CfopEscopo {
  ESTADUAL = 'ESTADUAL',
  INTERESTADUAL = 'INTERESTADUAL',
  EXTERIOR = 'EXTERIOR',
}

/**
 * Deriva tipoOperacao + escopo a partir do primeiro dígito. Garante consistência
 * entre o código numérico e os flags semânticos.
 */
export function inferirTipoEEscopo(codigo: string): {
  tipo: CfopTipoOperacao;
  escopo: CfopEscopo;
} {
  if (!/^[123567]\d{3}$/.test(codigo)) {
    throw new Error(`CFOP ${codigo} não começa com 1/2/3/5/6/7 ou não tem 4 dígitos`);
  }
  const primeiro = codigo[0];
  if (primeiro === '1') return { tipo: CfopTipoOperacao.ENTRADA, escopo: CfopEscopo.ESTADUAL };
  if (primeiro === '2')
    return { tipo: CfopTipoOperacao.ENTRADA, escopo: CfopEscopo.INTERESTADUAL };
  if (primeiro === '3') return { tipo: CfopTipoOperacao.ENTRADA, escopo: CfopEscopo.EXTERIOR };
  if (primeiro === '5') return { tipo: CfopTipoOperacao.SAIDA, escopo: CfopEscopo.ESTADUAL };
  if (primeiro === '6') return { tipo: CfopTipoOperacao.SAIDA, escopo: CfopEscopo.INTERESTADUAL };
  return { tipo: CfopTipoOperacao.SAIDA, escopo: CfopEscopo.EXTERIOR };
}

/**
 * Enums fiscais da NF-e modelo 55. Os valores TEXTUAIS são os usados internamente
 * (legibilidade + portabilidade em payload JSON); os valores NUMÉRICOS (em comentário)
 * são os que vão no XML quando a NF-e é serializada — o builder cuida do mapeamento.
 *
 * Fonte: MOC NF-e 7.00 + Nota Técnica RT 2025.002.
 */

/** Tipo da operação na NF-e (campo `tpNF`). */
export enum TipoOperacao {
  ENTRADA = 'ENTRADA', // 0
  SAIDA = 'SAIDA', // 1
}

export const TIPO_OPERACAO_CODIGO: Record<TipoOperacao, '0' | '1'> = {
  [TipoOperacao.ENTRADA]: '0',
  [TipoOperacao.SAIDA]: '1',
};

/**
 * Finalidade da emissão (campo `finNFe`).
 * NOTA_CREDITO e NOTA_DEBITO são as novas finalidades da Reforma — substituem ajustes
 * manuais e estão previstas no PRD seção 6.2.3 (NFE-30/31).
 */
export enum FinalidadeNFe {
  NORMAL = 'NORMAL', // 1
  COMPLEMENTAR = 'COMPLEMENTAR', // 2
  AJUSTE = 'AJUSTE', // 3
  DEVOLUCAO = 'DEVOLUCAO', // 4
  NOTA_CREDITO = 'NOTA_CREDITO', // 5 (Reforma)
  NOTA_DEBITO = 'NOTA_DEBITO', // 6 (Reforma)
}

export const FINALIDADE_CODIGO: Record<FinalidadeNFe, string> = {
  [FinalidadeNFe.NORMAL]: '1',
  [FinalidadeNFe.COMPLEMENTAR]: '2',
  [FinalidadeNFe.AJUSTE]: '3',
  [FinalidadeNFe.DEVOLUCAO]: '4',
  [FinalidadeNFe.NOTA_CREDITO]: '5',
  [FinalidadeNFe.NOTA_DEBITO]: '6',
};

/** Forma de emissão da NF-e (campo `tpEmis`). */
export enum FormaEmissao {
  NORMAL = 'NORMAL', // 1
  CONTINGENCIA_FSDA = 'CONTINGENCIA_FSDA', // 2
  CONTINGENCIA_SCAN = 'CONTINGENCIA_SCAN', // 3 (descontinuado)
  CONTINGENCIA_EPEC = 'CONTINGENCIA_EPEC', // 4
  CONTINGENCIA_FSDA_OUTRA = 'CONTINGENCIA_FSDA_OUTRA', // 5
  CONTINGENCIA_SVC_AN = 'CONTINGENCIA_SVC_AN', // 6
  CONTINGENCIA_SVC_RS = 'CONTINGENCIA_SVC_RS', // 7
  OFFLINE_NFCE = 'OFFLINE_NFCE', // 9
}

export const FORMA_EMISSAO_CODIGO: Record<FormaEmissao, string> = {
  [FormaEmissao.NORMAL]: '1',
  [FormaEmissao.CONTINGENCIA_FSDA]: '2',
  [FormaEmissao.CONTINGENCIA_SCAN]: '3',
  [FormaEmissao.CONTINGENCIA_EPEC]: '4',
  [FormaEmissao.CONTINGENCIA_FSDA_OUTRA]: '5',
  [FormaEmissao.CONTINGENCIA_SVC_AN]: '6',
  [FormaEmissao.CONTINGENCIA_SVC_RS]: '7',
  [FormaEmissao.OFFLINE_NFCE]: '9',
};

/**
 * Estado interno do documento — máquina de estados unificada (PRD INT-03).
 * Espelha o enum do schema Prisma v1.3.
 */
export enum DocumentStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  PROCESSING = 'PROCESSING',
  AUTHORIZED = 'AUTHORIZED',
  REJECTED = 'REJECTED',
  DENIED = 'DENIED',
  CANCELLED = 'CANCELLED',
  INUTILIZED = 'INUTILIZED',
  ERROR = 'ERROR',
}

/** Tipos de evento da NF-e (cancelamento, CC-e, ECONF, manifestação). */
export enum TipoEventoNFe {
  CANCELAMENTO = 'CANCELAMENTO', // 110111
  CARTA_CORRECAO = 'CARTA_CORRECAO', // 110110
  EPEC = 'EPEC', // 110140
  CIENCIA_OPERACAO = 'CIENCIA_OPERACAO', // 210210
  CONFIRMACAO_OPERACAO = 'CONFIRMACAO_OPERACAO', // 210200
  DESCONHECIMENTO = 'DESCONHECIMENTO', // 210220
  OPERACAO_NAO_REALIZADA = 'OPERACAO_NAO_REALIZADA', // 210240
  ATOR_INTERESSADO = 'ATOR_INTERESSADO', // 110150
  INSUCESSO_ENTREGA = 'INSUCESSO_ENTREGA', // 110192
  ECONF = 'ECONF', // 112110
  COMPROVANTE_ENTREGA = 'COMPROVANTE_ENTREGA', // 110130
}

export const TIPO_EVENTO_CODIGO: Record<TipoEventoNFe, string> = {
  [TipoEventoNFe.CANCELAMENTO]: '110111',
  [TipoEventoNFe.CARTA_CORRECAO]: '110110',
  [TipoEventoNFe.EPEC]: '110140',
  [TipoEventoNFe.CIENCIA_OPERACAO]: '210210',
  [TipoEventoNFe.CONFIRMACAO_OPERACAO]: '210200',
  [TipoEventoNFe.DESCONHECIMENTO]: '210220',
  [TipoEventoNFe.OPERACAO_NAO_REALIZADA]: '210240',
  [TipoEventoNFe.ATOR_INTERESSADO]: '110150',
  [TipoEventoNFe.INSUCESSO_ENTREGA]: '110192',
  [TipoEventoNFe.ECONF]: '112110',
  [TipoEventoNFe.COMPROVANTE_ENTREGA]: '110130',
};

/**
 * Códigos numéricos das UFs (cUF) usados em ide.cUF e na composição da chave de acesso.
 * Tabela oficial IBGE.
 */
export const UF_CODIGO: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17',
};

/**
 * Enums do domínio de recepção de DF-e (NF-e/CT-e/NFS-e recebidos contra o CNPJ).
 * PRD seção 6.4 (Importação e Entradas — ENT-01..ENT-15).
 */

/** Tipo de DF-e recebido — espelha o schema Prisma v1.3 (tipoDFe). */
export enum TipoDFe {
  NFE_55 = 'NFE_55',
  NFCE_65 = 'NFCE_65',
  NFSE_MUNICIPAL = 'NFSE_MUNICIPAL',
  NFSE_NACIONAL = 'NFSE_NACIONAL',
  CTE_57 = 'CTE_57',
  CTE_67_OS = 'CTE_67_OS',
  MDFE_58 = 'MDFE_58',
  NFCOM = 'NFCOM',
  DCE = 'DCE',
}

/** Estado interno do documento recebido. */
export enum ReceivedDocumentStatus {
  PENDENTE = 'PENDENTE',
  CONFERIDO = 'CONFERIDO',
  ESCRITURADO = 'ESCRITURADO',
  DEVOLVIDO = 'DEVOLVIDO',
}

/**
 * Tipo de manifestação do destinatário (tpEvento no XML do evento):
 *  - CIENCIA_OPERACAO       210210  → "tenho conhecimento da operação" (default)
 *  - CONFIRMACAO_OPERACAO   210200  → "confirmo recebimento da mercadoria"
 *  - DESCONHECIMENTO         210220  → "não reconheço a operação"
 *  - OPERACAO_NAO_REALIZADA  210240  → "operação documentada não ocorreu"
 *
 * Apenas CONFIRMACAO permite baixar o XML completo via Distribuição DF-e da SEFAZ
 * (com nota emitida por terceiros — para a própria emissão sempre temos o XML cru).
 */
export enum TipoManifestacao {
  CIENCIA_OPERACAO = 'CIENCIA_OPERACAO',
  CONFIRMACAO_OPERACAO = 'CONFIRMACAO_OPERACAO',
  DESCONHECIMENTO_OPERACAO = 'DESCONHECIMENTO_OPERACAO',
  OPERACAO_NAO_REALIZADA = 'OPERACAO_NAO_REALIZADA',
}

export const TIPO_MANIFESTACAO_CODIGO: Record<TipoManifestacao, string> = {
  [TipoManifestacao.CIENCIA_OPERACAO]: '210210',
  [TipoManifestacao.CONFIRMACAO_OPERACAO]: '210200',
  [TipoManifestacao.DESCONHECIMENTO_OPERACAO]: '210220',
  [TipoManifestacao.OPERACAO_NAO_REALIZADA]: '210240',
};

/** Origem da captura — útil para o operador entender de onde veio o documento. */
export enum OrigemCaptura {
  SEFAZ_DISTRIBUICAO = 'sefaz_distribuicao',
  FOCUS_NFSEN = 'focus_nfsen',
  UPLOAD_XML = 'upload_xml',
  UPLOAD_PDF = 'upload_pdf',
}

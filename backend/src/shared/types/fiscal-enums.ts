/**
 * Enums fiscais compartilhados entre módulos (Customer, Supplier, Product, Service, NF-e, NFS-e).
 * Os códigos refletem as tabelas oficiais da SEFAZ e a Nota Técnica RT 2025.002 para IBS/CBS/IS.
 * Comentários `// xx` indicam o valor numérico usado no XML do DF-e.
 */

export enum TipoPessoa {
  PF = 'PF',
  PJ = 'PJ',
  ESTRANGEIRO = 'ESTRANGEIRO',
}

/** Indicador de IE do destinatário/fornecedor (campo indIEDest na NF-e) */
export enum IndicadorIE {
  CONTRIBUINTE = 'CONTRIBUINTE', // 1
  ISENTO = 'ISENTO', // 2
  NAO_CONTRIBUINTE = 'NAO_CONTRIBUINTE', // 9
}

/**
 * CST de IBS/CBS — Reforma Tributária (Informe Técnico RT 2025.002).
 * Cada CST tem uma classificação de impacto (tributado, redução, suspensão, isenção, etc.)
 * e deve sempre vir acompanhada do código de classificação tributária (cClassTrib).
 */
export enum CstIbsCbs {
  TRIBUTACAO_INTEGRAL = 'TRIBUTACAO_INTEGRAL', // 000
  REDUCAO_ALIQUOTA = 'REDUCAO_ALIQUOTA', // 200
  REDUCAO_BASE_CALCULO = 'REDUCAO_BASE_CALCULO', // 210
  DIFERIMENTO = 'DIFERIMENTO', // 410
  SUSPENSAO = 'SUSPENSAO', // 510
  ISENCAO = 'ISENCAO', // 610
  IMUNIDADE = 'IMUNIDADE', // 620
  NAO_INCIDENCIA = 'NAO_INCIDENCIA', // 630
  CREDITO_PRESUMIDO = 'CREDITO_PRESUMIDO', // 800
}

/** Tipo de retenção em serviços (NFS-e). */
export enum TipoRetencaoIss {
  SEM_RETENCAO = 'SEM_RETENCAO',
  RETIDO_TOMADOR = 'RETIDO_TOMADOR',
  RETIDO_INTERMEDIARIO = 'RETIDO_INTERMEDIARIO',
}

/** Indicador de operação na DPS/NFS-e (campo cIndOp). */
export enum IndicadorOperacaoNFSe {
  TRIBUTADO = 'TRIBUTADO', // 1
  ALIQUOTA_ZERO = 'ALIQUOTA_ZERO', // 2
  IMUNE = 'IMUNE', // 3
  ISENTO_NFSE = 'ISENTO_NFSE', // 4
  NAO_INCIDENCIA_NFSE = 'NAO_INCIDENCIA_NFSE', // 5
}

/** Indicador de presença do comprador na NF-e (indPres). */
export enum IndicadorPresenca {
  NAO_APLICA = 0,
  PRESENCIAL = 1,
  INTERNET = 2,
  TELEATENDIMENTO = 3,
  ENTREGA_EM_DOMICILIO = 4,
  PRESENCIAL_FORA_ESTABELECIMENTO = 5,
  OUTROS = 9,
}

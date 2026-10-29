/**
 * Tipos do domínio fiscal espelhando o que o backend retorna. Versão minimalista que
 * cobre o que a UI consome — não importamos as entidades TypeORM diretamente para
 * manter front e back independentes.
 */

export type DocumentStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'AUTHORIZED'
  | 'REJECTED'
  | 'DENIED'
  | 'CANCELLED'
  | 'INUTILIZED'
  | 'ERROR';

export type FinalidadeNFe =
  | 'NORMAL'
  | 'COMPLEMENTAR'
  | 'AJUSTE'
  | 'DEVOLUCAO'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO';

export type TipoOperacao = 'ENTRADA' | 'SAIDA';
export type IndicadorIE = 'CONTRIBUINTE' | 'ISENTO' | 'NAO_CONTRIBUINTE';
export type TipoPessoa = 'PF' | 'PJ' | 'ESTRANGEIRO';
export type AmbienteSefaz = 'HOMOLOGACAO' | 'PRODUCAO';

export interface Customer {
  id: string;
  companyId: string;
  tipoPessoa: TipoPessoa;
  cnpjCpf: string;
  nomeRazao: string;
  email?: string | null;
  /// Inscrição Estadual — obrigatória para destinatário contribuinte de ICMS (vai como <IE> na NF-e).
  ie?: string | null;
  indicadorIE: IndicadorIE;
  consumidorFinal: boolean;
  uf: string;
  municipio: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  pontoReferencia?: string | null;
  bairro: string;
  codigoMunicipioIbge: string;
  observacoes?: string | null;
}

export interface Product {
  id: string;
  companyId: string;
  codigo: string;
  /** GTIN/EAN (código de barras) — vai em cEAN/cEANTrib da NF-e. */
  codigoBarras?: string | null;
  descricao: string;
  ncm: string;
  cest?: string | null;
  origem: number;
  unidadeComercial: string;
  unidadeTributavel: string;
  cfopPadraoSaida?: string | null;
  cfopPadraoEntrada?: string | null;
  active: boolean;
}

export interface CertificateView {
  id: string;
  companyId: string;
  alias: string;
  tipo: 'A1' | 'A3';
  subject: string;
  commonName: string;
  cnpjTitular: string | null;
  serialNumber: string;
  thumbprint: string;
  validFrom: string;
  validTo: string;
  active: boolean;
  revokedAt?: string | null;
}

export interface NFeListItem {
  id: string;
  numero: string;
  serie: number;
  chaveAcesso: string | null;
  dhEmissao: string;
  status: DocumentStatus;
  cStat: string | null;
  xMotivo: string | null;
  valorTotal: string;
  ufDestino: string | null;
  customerId: string | null;
  /** Razão social/nome do destinatário, resolvido no backend via join. */
  customerNome: string | null;
  /** CNPJ/CPF do destinatário (só dígitos). */
  customerCnpjCpf: string | null;
  naturezaOperacao: string;
  /** Data/hora da autorização — usada para a janela legal de cancelamento (24h). */
  dhAutorizacao: string | null;
}

export interface NFeItem {
  id: string;
  numeroItem: number;
  productId?: string | null;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidadeComercial?: string;
  quantidadeComercial: string;
  valorUnitario: string;
  valorTotal: string;
  valorDesconto?: string | null;
  valorFrete?: string | null;
  aliqIcms?: string | null;
  valorIcms?: string | null;
}

export interface NFeEvent {
  id: string;
  tipoEvento: string;
  sequencial: number;
  dhEvento: string;
  status: DocumentStatus;
  cStat: string | null;
  xMotivo: string | null;
  justificativa?: string | null;
  protocolo?: string | null;
}

export interface NFeFull extends NFeListItem {
  protocoloAutorizacao?: string | null;
  // dhAutorizacao é herdado de NFeListItem (string | null).
  ambiente: AmbienteSefaz;
  formaEmissao: string;
  valorProdutos: string;
  valorIcms: string;
  valorIpi: string;
  valorPis: string;
  valorCofins: string;
  valorIbs: string;
  valorCbs: string;
  valorIs: string;
  baseIbsCbs: string;
  operacaoInterestadual: boolean;
  infCpl?: string | null;
  items: NFeItem[];
  eventos: NFeEvent[];
}

/** Resultado do motor por item (POST /tax/simulate) — campos ausentes = não se aplica. */
export interface TaxSimulationItem {
  itemId: string;
  valorTotal: string;
  baseIcms?: string;
  aliqIcms?: string;
  valorIcms?: string;
  valorIcmsDeson?: string;
  /** Diferimento (CST 51): valorIcms = valorIcmsOp − valorIcmsDif. */
  valorIcmsOp?: string;
  pDif?: string;
  valorIcmsDif?: string;
  /** Crédito de ICMS do Simples (CSOSN 101/201/900). */
  baseCredSN?: string;
  pCredSN?: string;
  valorCredSN?: string;
  /** Valor aproximado dos tributos (Lei 12.741) — só consumidor final. */
  valorTotTrib?: string;
  valorTotTribFederal?: string;
  valorTotTribEstadual?: string;
  baseIcmsST?: string;
  aliqIcmsST?: string;
  valorIcmsST?: string;
  pMVAST?: string;
  pRedBCST?: string;
  baseFCP?: string;
  pFCP?: string;
  valorFCP?: string;
  baseICMSUFDest?: string;
  pICMSUFDest?: string;
  pICMSInter?: string;
  valorICMSUFDest?: string;
  baseFCPUFDest?: string;
  pFCPUFDest?: string;
  valorFCPUFDest?: string;
  baseIpi?: string;
  aliqIpi?: string;
  valorIpi?: string;
  basePis?: string;
  aliqPis?: string;
  valorPis?: string;
  baseCofins?: string;
  aliqCofins?: string;
  valorCofins?: string;
  cstIbsCbs?: string;
  cClassTrib?: string;
  baseIbsCbs?: string;
  aliqIbs?: string;
  valorIbs?: string;
  aliqCbs?: string;
  valorCbs?: string;
  modoAnoTesteIbsCbs?: boolean;
  /** Nomes das calculadoras que se aplicaram ao item ('icms-proprio', 'icms-st', …). */
  calculadorasAplicadas: string[];
  /** Calculadoras que não se aplicaram ao item → motivo (vem do motor). */
  calculadorasNaoAplicadas?: Record<string, string>;
  /** Códigos efetivos do item (regra vigente + override de CST/CSOSN da tela). */
  codigos: {
    cstIcms: string | null;
    csosnIcms: string | null;
    cstIpi: string | null;
    cstPis: string | null;
    cstCofins: string | null;
  };
  memoria: Array<{ calculadora: string; resumo: string }>;
  warnings: string[];
}

export interface TaxSimulationResult {
  itens: TaxSimulationItem[];
  totais: {
    valorProdutos: string;
    valorDesconto: string;
    valorFrete: string;
    valorSeguro: string;
    valorOutros: string;
    valorTotal: string;
    baseIcms: string;
    valorIcms: string;
    valorIcmsDeson: string;
    baseIcmsST: string;
    valorIcmsST: string;
    valorFCP: string;
    valorICMSUFDest: string;
    valorICMSUFRemet: string;
    valorFCPUFDest: string;
    valorIpi: string;
    valorPis: string;
    valorCofins: string;
    baseIbsCbs: string;
    valorIbs: string;
    valorCbs: string;
    valorIs: string;
    modoAnoTesteIbsCbs: boolean;
    valorCredSN: string;
    valorTotTrib: string;
    valorTotTribFederal: string;
    valorTotTribEstadual: string;
  };
  warnings: string[];
}

/** Classes Tailwind para o badge de status (mantido junto para uso consistente). */
export const STATUS_STYLES: Record<DocumentStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING: 'bg-amber-100 text-amber-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  AUTHORIZED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  DENIED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-zinc-200 text-zinc-700',
  INUTILIZED: 'bg-zinc-200 text-zinc-700',
  ERROR: 'bg-red-100 text-red-800',
};

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Pendente',
  SUBMITTED: 'Enviada',
  PROCESSING: 'Processando',
  AUTHORIZED: 'Autorizada',
  REJECTED: 'Rejeitada',
  DENIED: 'Denegada',
  CANCELLED: 'Cancelada',
  INUTILIZED: 'Inutilizada',
  ERROR: 'Erro',
};

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
  indicadorIE: IndicadorIE;
  consumidorFinal: boolean;
  uf: string;
  municipio: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  codigoMunicipioIbge: string;
}

export interface Product {
  id: string;
  companyId: string;
  codigo: string;
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
  naturezaOperacao: string;
}

export interface NFeItem {
  id: string;
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  quantidadeComercial: string;
  valorUnitario: string;
  valorTotal: string;
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
  dhAutorizacao?: string | null;
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

export interface TaxSimulationResult {
  itens: Array<{
    itemId: string;
    valorTotal: string;
    baseIcms?: string;
    valorIcms?: string;
    valorIcmsST?: string;
    valorICMSUFDest?: string;
    valorFCP?: string;
    valorIpi?: string;
    valorPis?: string;
    valorCofins?: string;
    valorIbs?: string;
    valorCbs?: string;
    memoria: Array<{ calculadora: string; resumo: string }>;
    warnings: string[];
  }>;
  totais: {
    valorProdutos: string;
    valorTotal: string;
    valorIcms: string;
    valorIcmsST: string;
    valorICMSUFDest: string;
    valorIbs: string;
    valorCbs: string;
    modoAnoTesteIbsCbs: boolean;
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

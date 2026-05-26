import { api } from '@/lib/api';

export interface TaxParameter {
  id: string;
  companyId: string | null;
  chave: string;
  valor: unknown;
  fonteNorma: string | null;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTaxParameterPayload {
  chave: string;
  valor: unknown;
  fonteNorma?: string | null;
  validFrom: string;
  validTo?: string | null;
  scope: 'global' | 'company';
}

export interface InterstateAliquot {
  id: string;
  ufOrigem: string;
  ufDestino: string;
  /** ICMS interestadual nacional (7% ou 12%). */
  aliqNacional: string;
  /** ICMS interestadual importado (4% — Res. 13/2012). */
  aliqImportado: string;
  validFrom: string;
  validTo: string | null;
  fonteNorma: string | null;
}

export interface IcmsStMva {
  id: string;
  ufOrigem: string;
  ufDestino: string;
  ncm: string;
  descricao: string | null;
  mvaOriginal: string;
  /** MVA ajustada quando origem é importada (alíquota interestadual 4%). */
  mvaAjustada4: string | null;
  /** MVA ajustada quando interestadual é 7%. */
  mvaAjustada7: string | null;
  /** MVA ajustada quando interestadual é 12%. */
  mvaAjustada12: string | null;
  protocolo: string | null;
  validFrom: string;
  validTo: string | null;
  fonteNorma: string | null;
}

export type TipoBeneficio =
  | 'ISENCAO'
  | 'REDUCAO_BASE'
  | 'REDUCAO_ALIQUOTA'
  | 'CREDITO_PRESUMIDO'
  | 'DIFERIMENTO';

export interface BeneficioFiscalUf {
  id: string;
  uf: string;
  ncm: string | null;
  codBeneficio: string;
  descricao: string;
  tipo: TipoBeneficio;
  /** Percentual de redução de base, alíquota efetiva ou crédito presumido. */
  percentual: string | null;
  validFrom: string;
  validTo: string | null;
  fonteNorma: string | null;
}

export async function listTaxParameters(scope: 'all' | 'global' | 'company' = 'all') {
  return api<TaxParameter[]>(`/tax/parameters?scope=${scope}`);
}

export async function upsertTaxParameter(payload: UpsertTaxParameterPayload) {
  return api<TaxParameter>('/tax/parameters', { method: 'POST', body: payload });
}

export async function listInterstateAliquots() {
  return api<InterstateAliquot[]>('/tax/interstate-aliquots');
}

export async function listIcmsStMva() {
  return api<IcmsStMva[]>('/tax/icms-st-mva');
}

export async function listBeneficios() {
  return api<BeneficioFiscalUf[]>('/tax/beneficios-fiscais');
}

import { api } from '@/lib/api';

export interface Company {
  id: string;
  tenantId: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  ie: string | null;
  im: string | null;
  crt: CodigoRegimeTributario;
  cnae: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string | null;
  email: string | null;
  ambienteSefaz: AmbienteSefaz;
  emiteNfe: boolean;
  emiteNfse: boolean;
  usaIcms: boolean;
  usaIcmsSt: boolean;
  usaIpi: boolean;
  usaDifal: boolean;
  usaFcp: boolean;
  usaIcmsDesonerado: boolean;
}

export type AmbienteSefaz = 'HOMOLOGACAO' | 'PRODUCAO';

/** Códigos CRT — Regime Tributário do MOC. */
export type CodigoRegimeTributario =
  | 'SIMPLES_NACIONAL'
  | 'SIMPLES_EXCESSO_RECEITA'
  | 'REGIME_NORMAL'
  | 'MEI';

export interface CreateCompanyPayload {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  ie?: string | null;
  im?: string | null;
  crt: CodigoRegimeTributario;
  cnae?: string | null;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone?: string | null;
  email?: string | null;
  ambienteSefaz?: AmbienteSefaz;
  emiteNfe?: boolean;
  emiteNfse?: boolean;
  usaIcms?: boolean;
  usaIcmsSt?: boolean;
  usaIpi?: boolean;
  usaDifal?: boolean;
  usaFcp?: boolean;
  usaIcmsDesonerado?: boolean;
}

export async function listCompanies(): Promise<Company[]> {
  return api<Company[]>('/companies');
}

export async function createCompany(payload: CreateCompanyPayload): Promise<Company> {
  return api<Company>('/companies', { method: 'POST', body: payload });
}

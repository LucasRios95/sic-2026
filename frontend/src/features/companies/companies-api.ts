import { api } from '@/lib/api';

export interface Company {
  id: string;
  tenantId: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  uf: string;
  municipio: string;
  crt: string;
  ambienteSefaz: string;
  emiteNfe: boolean;
  emiteNfse: boolean;
  usaIcms: boolean;
  usaIcmsSt: boolean;
  usaIpi: boolean;
  usaDifal: boolean;
  usaFcp: boolean;
  usaIcmsDesonerado: boolean;
}

export async function listCompanies(): Promise<Company[]> {
  return api<Company[]>('/companies');
}

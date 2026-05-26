import { api } from '@/lib/api';

export interface CepLookupResult {
  cep: string;
  logradouro: string;
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  codigoIbgeMunicipio: string | null;
}

export interface CnpjLookupResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string;
  dataAbertura: string | null;
  cnae: string | null;
  cnaeDescricao: string | null;
  naturezaJuridica: string | null;
  porte: string | null;
  capitalSocial: string | null;
  endereco: {
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    codigoIbgeMunicipio: string | null;
  };
  contato: {
    telefone: string | null;
    email: string | null;
  };
  source?: 'brasilapi' | 'receitaws';
}

export async function lookupCep(cep: string): Promise<CepLookupResult> {
  const clean = cep.replace(/\D/g, '');
  return api<CepLookupResult>(`/lookup/cep/${clean}`);
}

export async function lookupCnpj(cnpj: string): Promise<CnpjLookupResult> {
  const clean = cnpj.replace(/\D/g, '');
  return api<CnpjLookupResult>(`/lookup/cnpj/${clean}`);
}

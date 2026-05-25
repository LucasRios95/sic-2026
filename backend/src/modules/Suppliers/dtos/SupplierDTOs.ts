import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { IndicadorIE, TipoPessoa } from '@shared/types/fiscal-enums';

export interface ICreateSupplierDTO {
  companyId: string;
  tipoPessoa: TipoPessoa;
  cnpjCpf: string;
  nomeRazao: string;
  nomeFantasia?: string | null;
  ie?: string | null;
  indicadorIE: IndicadorIE;
  crtFornecedor?: CodigoRegimeTributario | null;
  produtorRural?: boolean;
  email?: string | null;
  telefone?: string | null;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
}

export type IUpdateSupplierDTO = Partial<Omit<ICreateSupplierDTO, 'companyId' | 'cnpjCpf' | 'tipoPessoa'>>;

export interface IListSuppliersFilter {
  companyId: string;
  search?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

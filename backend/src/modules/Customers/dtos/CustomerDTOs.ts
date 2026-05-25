import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { IndicadorIE, IndicadorPresenca, TipoPessoa } from '@shared/types/fiscal-enums';

export interface ICreateCustomerDTO {
  companyId: string;
  tipoPessoa: TipoPessoa;
  cnpjCpf: string;
  nomeRazao: string;
  nomeFantasia?: string | null;
  ie?: string | null;
  indicadorIE: IndicadorIE;
  im?: string | null;
  suframa?: string | null;
  email?: string | null;
  telefone?: string | null;
  crtDestinatario?: CodigoRegimeTributario | null;
  consumidorFinal?: boolean;
  indicadorPresenca?: IndicadorPresenca | null;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
  pais?: string;
  codigoPais?: string;
  limiteCredito?: string | null;
  bloqueado?: boolean;
}

export type IUpdateCustomerDTO = Partial<Omit<ICreateCustomerDTO, 'companyId' | 'cnpjCpf' | 'tipoPessoa'>>;

export interface IListCustomersFilter {
  companyId: string;
  search?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

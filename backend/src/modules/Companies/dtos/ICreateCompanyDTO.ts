import { AmbienteSefaz, CodigoRegimeTributario } from '../infra/typeorm/entities/Company';

export interface ICreateCompanyDTO {
  tenantId: string;

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
  ambienteFocusNfe?: AmbienteSefaz;
  emiteNfe?: boolean;
  emiteNfse?: boolean;

  usaIcms?: boolean;
  usaIcmsSt?: boolean;
  usaIpi?: boolean;
  usaDifal?: boolean;
  usaFcp?: boolean;
  usaIcmsDesonerado?: boolean;
}

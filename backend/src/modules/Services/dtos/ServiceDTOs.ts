import {
  CstIbsCbs,
  IndicadorOperacaoNFSe,
  TipoRetencaoIss,
} from '@shared/types/fiscal-enums';

export interface IServiceTaxRuleDTO {
  cstIss?: string | null;
  aliqIss?: string | null;
  tipoRetencao?: TipoRetencaoIss;
  cstIbsCbs?: CstIbsCbs | null;
  cClassTrib?: string | null;
  cIndOp?: IndicadorOperacaoNFSe | null;
  cstPis?: string | null;
  cstCofins?: string | null;
  retemPisCofins?: boolean;
  retemCsll?: boolean;
  retemInss?: boolean;
  retemIr?: boolean;
  validFrom: string; // ISO8601
  validTo?: string | null;
}

export interface ICreateServiceDTO {
  companyId: string;
  codigo: string;
  descricao: string;
  codigoTributacaoNacional?: string | null;
  itemListaServico: string;
  codigoTributacaoMunicipal?: string | null;
  cnae?: string | null;
  initialTaxRule?: IServiceTaxRuleDTO;
}

export type IUpdateServiceDTO = Partial<
  Omit<ICreateServiceDTO, 'companyId' | 'codigo' | 'initialTaxRule'>
>;

export interface IListServicesFilter {
  companyId: string;
  search?: string;
  itemListaServico?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

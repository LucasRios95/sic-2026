import { CstIbsCbs } from '@shared/types/fiscal-enums';

export interface IProductTaxRuleDTO {
  // ICMS próprio
  cstIcms?: string | null;
  csosnIcms?: string | null;
  aliqIcms?: string | null;
  modBC?: number | null;
  pRedBC?: string | null;
  importado?: boolean;
  // ICMS-ST
  cstIcmsSt?: string | null;
  modBCST?: number | null;
  pMVAST?: string | null;
  pRedBCST?: string | null;
  pICMSST?: string | null;
  pICMSEfetivo?: string | null;
  // ICMS desonerado
  motDesICMS?: number | null;
  // FCP
  pFCP?: string | null;
  pFCPST?: string | null;
  pFCPSTRet?: string | null;
  // IPI
  cstIpi?: string | null;
  cEnq?: string | null;
  aliqIpi?: string | null;
  ipiPorUnidade?: boolean;
  vUnidIpi?: string | null;
  // PIS/COFINS
  cstPis?: string | null;
  aliqPis?: string | null;
  cstCofins?: string | null;
  aliqCofins?: string | null;
  pisCofinsPorUnidade?: boolean;
  vUnidPis?: string | null;
  vUnidCofins?: string | null;
  // IBS/CBS/IS
  cstIbsCbs?: CstIbsCbs | null;
  cClassTrib?: string | null;
  aliqIbsProduto?: string | null;
  aliqCbsProduto?: string | null;
  cstIs?: string | null;
  aliqIs?: string | null;
  incidenciaIs?: boolean;
  // Vigência
  validFrom: string; // ISO8601
  validTo?: string | null;
}

export interface ICreateProductDTO {
  companyId: string;
  codigo: string;
  codigoBarras?: string | null;
  descricao: string;
  ncm: string;
  cest?: string | null;
  origem: number;
  unidadeComercial: string;
  unidadeTributavel: string;
  pesoLiquido?: string | null;
  pesoBruto?: string | null;
  controlaEstoque?: boolean;
  /// Opcional: criar a primeira regra tributária junto com o produto
  initialTaxRule?: IProductTaxRuleDTO;
}

export type IUpdateProductDTO = Partial<
  Omit<ICreateProductDTO, 'companyId' | 'codigo' | 'initialTaxRule'>
>;

export interface IListProductsFilter {
  companyId: string;
  search?: string;
  ncm?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

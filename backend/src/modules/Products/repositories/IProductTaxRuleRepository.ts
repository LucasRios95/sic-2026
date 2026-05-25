import { ProductTaxRule } from '../infra/typeorm/entities/ProductTaxRule';

export interface CreateProductTaxRuleData {
  productId: string;
  validFrom: Date;
  validTo?: Date | null;
  cstIcms?: string | null;
  csosnIcms?: string | null;
  aliqIcms?: string | null;
  modBC?: number | null;
  pRedBC?: string | null;
  importado?: boolean;
  cstIcmsSt?: string | null;
  modBCST?: number | null;
  pMVAST?: string | null;
  pRedBCST?: string | null;
  pICMSST?: string | null;
  pICMSEfetivo?: string | null;
  motDesICMS?: number | null;
  pFCP?: string | null;
  pFCPST?: string | null;
  pFCPSTRet?: string | null;
  cstIpi?: string | null;
  cEnq?: string | null;
  aliqIpi?: string | null;
  ipiPorUnidade?: boolean;
  vUnidIpi?: string | null;
  cstPis?: string | null;
  aliqPis?: string | null;
  cstCofins?: string | null;
  aliqCofins?: string | null;
  pisCofinsPorUnidade?: boolean;
  vUnidPis?: string | null;
  vUnidCofins?: string | null;
  cstIbsCbs?: ProductTaxRule['cstIbsCbs'];
  cClassTrib?: string | null;
  aliqIbsProduto?: string | null;
  aliqCbsProduto?: string | null;
  cstIs?: string | null;
  aliqIs?: string | null;
  incidenciaIs?: boolean;
}

export interface IProductTaxRuleRepository {
  create(data: CreateProductTaxRuleData): Promise<ProductTaxRule>;
  /**
   * Retorna todas as regras de um produto ordenadas por validFrom asc — necessário
   * para detectar sobreposição de vigência ao adicionar uma nova regra.
   */
  listByProduct(productId: string): Promise<ProductTaxRule[]>;
  /**
   * Regra vigente em D — `validFrom ≤ D AND (validTo IS NULL OR validTo > D)`.
   * Usada pelo motor tributário no momento da emissão (Fase 1a).
   */
  findActiveAt(productId: string, date: Date): Promise<ProductTaxRule | null>;
}

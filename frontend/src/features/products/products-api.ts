import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api';
import type { Product } from '@/shared/types/fiscal';

function selectedCompanyOrThrow(): string {
  const id = useAuthStore.getState().selectedCompanyId;
  if (!id) throw new Error('Empresa não selecionada');
  return id;
}

export interface ListProductsFilter {
  search?: string;
  ncm?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export async function listProducts(filter: ListProductsFilter = {}): Promise<{
  items: Product[];
  total: number;
}> {
  const companyId = selectedCompanyOrThrow();
  const params = new URLSearchParams();
  if (filter.search) params.set('search', filter.search);
  if (filter.ncm) params.set('ncm', filter.ncm);
  if (filter.active !== undefined) params.set('active', String(filter.active));
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.offset) params.set('offset', String(filter.offset));

  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333'}/products?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
        'X-Company-Id': companyId,
      },
    },
  );
  const payload = (await response.json()) as { data: Product[]; meta: { total: number } };
  if (!response.ok) throw new Error('Falha ao listar produtos');
  return { items: payload.data, total: payload.meta.total };
}

export interface CreateProductPayload {
  codigo: string;
  codigoBarras?: string | null;
  descricao: string;
  ncm: string;
  cest?: string | null;
  origem: number;
  unidadeComercial: string;
  unidadeTributavel: string;
  cfopPadraoSaida?: string | null;
  cfopPadraoEntrada?: string | null;
  pesoLiquido?: string | null;
  pesoBruto?: string | null;
  controlaEstoque?: boolean;
  initialTaxRule?: {
    aliqIcms?: string;
    cstIcms?: string;
    cstIbsCbs?: string;
    cClassTrib?: string;
    validFrom: string;
    validTo?: string | null;
  };
}

export async function createProduct(payload: CreateProductPayload): Promise<Product> {
  return api<Product>('/products', {
    method: 'POST',
    body: payload,
    companyId: selectedCompanyOrThrow(),
  });
}

/**
 * Backend retorna `{ product, taxRules }` — para os callers que só precisam do produto
 * (combobox da NFeNewPage, autocomplete de unidade etc.), desempacotamos aqui.
 */
export async function getProduct(id: string): Promise<Product> {
  const result = await api<{ product: Product; taxRules: ProductTaxRule[] }>(
    `/products/${id}`,
    { companyId: selectedCompanyOrThrow() },
  );
  return result.product;
}

export interface ProductTaxRule {
  id: string;
  productId: string;
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
  cstIbsCbs?: string | null;
  cClassTrib?: string | null;
  aliqIbsProduto?: string | null;
  aliqCbsProduto?: string | null;
  cstIs?: string | null;
  aliqIs?: string | null;
  incidenciaIs?: boolean;
  validFrom: string;
  validTo?: string | null;
}

/** Versão completa — usada na tela de edição da regra tributária. */
export async function getProductWithTaxRules(id: string): Promise<{
  product: Product;
  taxRules: ProductTaxRule[];
}> {
  return api<{ product: Product; taxRules: ProductTaxRule[] }>(`/products/${id}`, {
    companyId: selectedCompanyOrThrow(),
  });
}

/**
 * Substitui a regra tributária vigente. Backend encerra a janela aberta (carimba
 * `validTo = now`) e cria uma nova vigente (`validFrom = now`, `validTo = null`).
 * O histórico fica preservado.
 */
export type ReplaceCurrentTaxRulePayload = Omit<ProductTaxRule, 'id' | 'productId' | 'validFrom' | 'validTo'>;

export async function replaceCurrentTaxRule(
  productId: string,
  payload: ReplaceCurrentTaxRulePayload,
): Promise<ProductTaxRule> {
  return api<ProductTaxRule>(`/products/${productId}/tax-rules/current`, {
    method: 'PUT',
    body: payload,
    companyId: selectedCompanyOrThrow(),
  });
}

/**
 * Update parcial — não permite trocar `codigo` (índice único; alteração causaria confusão
 * com NFe históricas) nem `initialTaxRule` (regras são versionadas via endpoint dedicado).
 */
export type UpdateProductPayload = Partial<
  Omit<CreateProductPayload, 'codigo' | 'initialTaxRule'>
>;

export async function updateProduct(
  id: string,
  payload: UpdateProductPayload,
): Promise<Product> {
  return api<Product>(`/products/${id}`, {
    method: 'PUT',
    body: payload,
    companyId: selectedCompanyOrThrow(),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await api<void>(`/products/${id}`, {
    method: 'DELETE',
    companyId: selectedCompanyOrThrow(),
  });
}

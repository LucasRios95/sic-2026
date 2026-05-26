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

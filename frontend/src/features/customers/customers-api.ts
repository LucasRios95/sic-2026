import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api';
import type { Customer, IndicadorIE, TipoPessoa } from '@/shared/types/fiscal';

function withCompany(): { companyId: string } {
  const companyId = useAuthStore.getState().selectedCompanyId;
  if (!companyId) throw new Error('Empresa não selecionada — escolha uma para operar');
  return { companyId };
}

export interface ListCustomersFilter {
  search?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export async function listCustomers(filter: ListCustomersFilter = {}): Promise<{
  items: Customer[];
  total: number;
}> {
  const { companyId } = withCompany();
  const params = new URLSearchParams();
  if (filter.search) params.set('search', filter.search);
  if (filter.active !== undefined) params.set('active', String(filter.active));
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.offset) params.set('offset', String(filter.offset));

  // O wrapper api() desempacota { data, meta } → retorna data. Para pegar `meta.total`
  // junto, fazemos uma chamada bruta e tratamos manualmente.
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333'}/customers?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
        'X-Company-Id': companyId,
      },
    },
  );
  const payload = (await response.json()) as { data: Customer[]; meta: { total: number } };
  if (!response.ok) throw new Error('Falha ao listar clientes');
  return { items: payload.data, total: payload.meta.total };
}

export interface CreateCustomerPayload {
  tipoPessoa: TipoPessoa;
  cnpjCpf: string;
  nomeRazao: string;
  indicadorIE: IndicadorIE;
  email?: string;
  consumidorFinal?: boolean;
  logradouro: string;
  numero: string;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
}

export async function createCustomer(payload: CreateCustomerPayload): Promise<Customer> {
  return api<Customer>('/customers', {
    method: 'POST',
    body: payload,
    companyId: withCompany().companyId,
  });
}

export async function getCustomer(id: string): Promise<Customer> {
  return api<Customer>(`/customers/${id}`, {
    companyId: withCompany().companyId,
  });
}

/** Atualização parcial — endpoint PUT aceita Partial<CreateCustomerPayload> menos tipo/documento. */
export type UpdateCustomerPayload = Partial<Omit<CreateCustomerPayload, 'tipoPessoa' | 'cnpjCpf'>>;

export async function updateCustomer(
  id: string,
  payload: UpdateCustomerPayload,
): Promise<Customer> {
  return api<Customer>(`/customers/${id}`, {
    method: 'PUT',
    body: payload,
    companyId: withCompany().companyId,
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  await api<void>(`/customers/${id}`, {
    method: 'DELETE',
    companyId: withCompany().companyId,
  });
}

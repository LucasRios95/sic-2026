import { api } from '@/lib/api';

export interface Ncm {
  id: string;
  codigo: string;
  codigoSemPontos: string;
  descricao: string;
  nivel: number;
  validoParaNfe: boolean;
  dataInicio: string | null;
  dataFim: string | null;
  ato: string | null;
  ativo: boolean;
}

export interface ListNcmsFilter {
  search?: string;
  apenasValidosNfe?: boolean;
  nivel?: number;
  limit?: number;
  offset?: number;
}

export interface ListNcmsResponse {
  data: Ncm[];
  meta: { total: number };
}

/**
 * O endpoint backend devolve `{ data, meta }` envelope; `api<T>` desempacota o `data`
 * num envelope simples, mas aqui queremos o `meta` também. Por isso fetch direto:
 */
import { env } from '@/env';
import { useAuthStore } from '@/features/auth/auth-store';

export async function listNcms(filter: ListNcmsFilter = {}): Promise<ListNcmsResponse> {
  const params = new URLSearchParams();
  if (filter.search) params.set('search', filter.search);
  if (filter.apenasValidosNfe) params.set('apenasValidosNfe', 'true');
  if (filter.nivel) params.set('nivel', String(filter.nivel));
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.offset) params.set('offset', String(filter.offset));
  const qs = params.toString();

  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${env.apiBaseUrl}/ncms${qs ? `?${qs}` : ''}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as ListNcmsResponse;
}

export async function getNcm(codigo: string): Promise<Ncm> {
  return api<Ncm>(`/ncms/${codigo.replace(/\D/g, '')}`);
}

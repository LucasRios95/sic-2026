import { env } from '@/env';
import { useAuthStore } from '@/features/auth/auth-store';

export interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
  companyId?: string;
}

/**
 * Wrapper de fetch que:
 *  - injeta Authorization Bearer automaticamente quando há access token
 *  - injeta X-Company-Id quando informado
 *  - desempacota o envelope { data | error } do backend
 *  - converte 401 em estado "deslogado" para forçar redirecionamento
 */
export async function api<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, skipAuth, companyId, headers, ...rest } = options;

  const finalHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(headers ?? {}),
  };

  if (!skipAuth) {
    const token = useAuthStore.getState().accessToken;
    if (token) (finalHeaders as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  if (companyId) {
    (finalHeaders as Record<string, string>)['X-Company-Id'] = companyId;
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 No Content
  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { data: T }
    | ApiErrorEnvelope
    | null;

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clear();
    }
    if (payload && 'error' in payload) {
      throw new ApiError(
        response.status,
        payload.error.code,
        payload.error.message,
        payload.error.details,
        payload.requestId,
      );
    }
    throw new ApiError(response.status, 'UNKNOWN', `HTTP ${response.status}`);
  }

  if (payload && 'data' in payload) return payload.data;
  return payload as T;
}

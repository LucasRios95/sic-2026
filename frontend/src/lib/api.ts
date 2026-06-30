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
 * Refresh silencioso do access token. Várias requisições que tomam 401 ao mesmo
 * tempo compartilham a MESMA promise (dedupe), então só um POST /auth/refresh
 * acontece por janela de expiração. Retorna o novo access token, ou null se não
 * há refresh token ou o refresh falhou (nesse caso a sessão é limpa).
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    useAuthStore.getState().clear();
    return null;
  }

  try {
    const response = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      useAuthStore.getState().clear();
      return null;
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: { accessToken: string; refreshToken: string; refreshTokenExpiresAt: string };
    } | null;

    const tokens = payload?.data;
    if (!tokens?.accessToken) {
      useAuthStore.getState().clear();
      return null;
    }

    useAuthStore.getState().updateTokens(tokens);
    return tokens.accessToken;
  } catch {
    // Falha de rede no refresh: não desloga (pode ser intermitente). Mantém a
    // sessão e deixa a requisição original falhar normalmente.
    return null;
  }
}

/** Garante um único refresh concorrente. */
function ensureRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Wrapper de fetch que:
 *  - injeta Authorization Bearer automaticamente quando há access token
 *  - injeta X-Company-Id quando informado
 *  - desempacota o envelope { data | error } do backend
 *  - no 401, tenta um refresh silencioso e repete a requisição uma vez; só
 *    desloga se o refresh falhar
 */
export async function api<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, skipAuth, companyId, headers, ...rest } = options;

  const buildHeaders = (token: string | null): HeadersInit => {
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((headers as Record<string, string>) ?? {}),
    };
    if (!skipAuth && token) finalHeaders.Authorization = `Bearer ${token}`;
    if (companyId) finalHeaders['X-Company-Id'] = companyId;
    return finalHeaders;
  };

  const doFetch = (token: string | null): Promise<Response> =>
    fetch(`${env.apiBaseUrl}${path}`, {
      ...rest,
      headers: buildHeaders(token),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response = await doFetch(useAuthStore.getState().accessToken);

  // 401: tenta renovar a sessão e repetir UMA vez. Não tenta para chamadas
  // skipAuth (login/refresh/logout) — elas tratam o erro por conta própria.
  if (response.status === 401 && !skipAuth) {
    const newToken = await ensureRefresh();
    if (newToken) {
      response = await doFetch(newToken);
    }
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { data: T }
    | ApiErrorEnvelope
    | null;

  if (!response.ok) {
    if (response.status === 401 && !skipAuth) {
      // Refresh não resolveu (já limpou a sessão em refreshAccessToken).
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

import { useEffect } from 'react';

import { refreshSession } from './auth-api';
import { useAuthStore } from './auth-store';

/** Decodifica o `exp` (epoch em segundos) do payload de um JWT, sem dependência externa. */
function getJwtExpMs(token: string): number | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    // base64url → base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64)) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

const REFRESH_LEAD_MS = 60_000; // refresca 60s antes de expirar
const MIN_DELAY_MS = 5_000; // piso para evitar loop quando já está perto de expirar

/**
 * Refresh proativo: agenda a renovação do access token ~60s antes de expirar,
 * evitando o 401 visível. É complementar ao refresh reativo do wrapper `api()`
 * (que segura a sessão caso este timer falhe). Monte uma vez no layout autenticado.
 */
export function useSessionRefresh(): void {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    const expMs = getJwtExpMs(accessToken);
    if (expMs == null) return;

    const delay = Math.max(expMs - Date.now() - REFRESH_LEAD_MS, MIN_DELAY_MS);

    const timer = window.setTimeout(async () => {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) return;
      try {
        const tokens = await refreshSession(refreshToken);
        useAuthStore.getState().updateTokens(tokens);
      } catch {
        // Silencioso: se falhar, o refresh reativo no próximo 401 ainda tenta.
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [accessToken]);
}

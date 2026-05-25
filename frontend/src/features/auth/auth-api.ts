import { api } from '@/lib/api';

import type { AuthUser } from './auth-store';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  return api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: payload,
    skipAuth: true,
  });
}

export async function fetchMe(): Promise<AuthUser> {
  return api<AuthUser>('/auth/me');
}

export async function logout(refreshToken: string): Promise<void> {
  await api<void>('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    skipAuth: true,
  });
}

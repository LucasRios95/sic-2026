import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  accessibleCompanyIds: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: string | null;
  user: AuthUser | null;
  selectedCompanyId: string | null;
  setSession: (params: {
    accessToken: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
    user: AuthUser;
  }) => void;
  setUser: (user: AuthUser) => void;
  setCompany: (companyId: string) => void;
  clear: () => void;
}

/**
 * Persistimos só o que é seguro guardar no navegador:
 *  - accessToken (curta duração — 15 min)
 *  - refreshToken (token opaco, rotativo a cada refresh — mitiga roubo)
 *  - user (perfil resumido, sem segredos)
 *  - selectedCompanyId
 * Em produção, mover refreshToken para httpOnly cookie servido pelo backend é o ideal;
 * essa otimização entra na fase de hardening (TSK-026 do Plano).
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      refreshTokenExpiresAt: null,
      user: null,
      selectedCompanyId: null,
      setSession: ({ accessToken, refreshToken, refreshTokenExpiresAt, user }) => {
        const onlyAccessible = user.accessibleCompanyIds.filter(
          (id) => id !== '00000000-0000-0000-0000-000000000000',
        );
        set({
          accessToken,
          refreshToken,
          refreshTokenExpiresAt,
          user,
          selectedCompanyId: onlyAccessible.length === 1 ? onlyAccessible[0] : null,
        });
      },
      setUser: (user) => set({ user }),
      setCompany: (companyId) => set({ selectedCompanyId: companyId }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          refreshTokenExpiresAt: null,
          user: null,
          selectedCompanyId: null,
        }),
    }),
    { name: 'sic-2026-auth' },
  ),
);

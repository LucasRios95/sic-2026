import { api } from '@/lib/api';

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface UserRoleAssignment {
  roleId: string;
  roleName: string;
  /** null = papel global (todas as empresas do tenant). */
  companyId: string | null;
  companyName: string | null;
}

export interface CreateUserPayload {
  email: string;
  fullName: string;
  password: string;
}

export async function listUsers(): Promise<AppUser[]> {
  return api<AppUser[]>('/users');
}

export async function createUser(payload: CreateUserPayload): Promise<AppUser> {
  return api<AppUser>('/users', { method: 'POST', body: payload });
}

export async function listRoles(): Promise<Role[]> {
  return api<Role[]>('/users/roles');
}

export async function listUserRoles(userId: string): Promise<UserRoleAssignment[]> {
  return api<UserRoleAssignment[]>(`/users/${userId}/roles`);
}

/** companyId null/ausente = concede papel global (todas as empresas do tenant). */
export async function assignUserRole(
  userId: string,
  body: { roleId: string; companyId?: string | null },
): Promise<void> {
  await api(`/users/${userId}/roles`, { method: 'POST', body });
}

export async function revokeUserRole(
  userId: string,
  body: { roleId: string; companyId?: string | null },
): Promise<void> {
  await api(`/users/${userId}/roles`, { method: 'DELETE', body });
}

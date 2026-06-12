import { UserRole } from '../infra/typeorm/entities/UserRole';

export interface AssignUserRoleData {
  userId: string;
  roleId: string;
  companyId?: string | null;
}

export interface UserPermissionContext {
  permissions: string[];
  roles: string[];
  accessibleCompanyIds: string[];
}

export interface IUserRoleRepository {
  assign(data: AssignUserRoleData): Promise<UserRole>;
  revoke(data: AssignUserRoleData): Promise<void>;
  /** Vínculos do usuário, com role e company carregados (company nulo = papel global). */
  findByUser(userId: string): Promise<UserRole[]>;
  loadContextForUser(userId: string): Promise<UserPermissionContext>;
}

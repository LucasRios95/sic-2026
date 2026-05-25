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
  loadContextForUser(userId: string): Promise<UserPermissionContext>;
}

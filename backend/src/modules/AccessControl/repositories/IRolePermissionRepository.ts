import { RolePermission } from '../infra/typeorm/entities/RolePermission';

export interface IRolePermissionRepository {
  assignMany(roleId: string, permissionIds: string[]): Promise<void>;
  listByRole(roleId: string): Promise<RolePermission[]>;
}

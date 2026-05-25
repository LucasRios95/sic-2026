import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IRolePermissionRepository } from '../../../repositories/IRolePermissionRepository';
import { RolePermission } from '../entities/RolePermission';

export class RolePermissionRepository implements IRolePermissionRepository {
  private readonly repo: Repository<RolePermission>;

  constructor() {
    this.repo = appDataSource.getRepository(RolePermission);
  }

  async assignMany(roleId: string, permissionIds: string[]): Promise<void> {
    if (permissionIds.length === 0) return;
    const rows = permissionIds.map((permissionId) => ({ roleId, permissionId }));
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(RolePermission)
      .values(rows)
      .orIgnore()
      .execute();
  }

  async listByRole(roleId: string): Promise<RolePermission[]> {
    return this.repo.find({ where: { roleId } });
  }
}

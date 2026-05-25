import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { CreateRoleData, IRoleRepository } from '../../../repositories/IRoleRepository';
import { Role } from '../entities/Role';

export class RoleRepository implements IRoleRepository {
  private readonly repo: Repository<Role>;

  constructor() {
    this.repo = appDataSource.getRepository(Role);
  }

  async create(data: CreateRoleData): Promise<Role> {
    const role = this.repo.create(data);
    return this.repo.save(role);
  }

  async findById(id: string): Promise<Role | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByName(tenantId: string, name: string): Promise<Role | null> {
    return this.repo.findOne({ where: { tenantId, name } });
  }
}

import { In, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IPermissionRepository } from '../../../repositories/IPermissionRepository';
import { Permission } from '../entities/Permission';

export class PermissionRepository implements IPermissionRepository {
  private readonly repo: Repository<Permission>;

  constructor() {
    this.repo = appDataSource.getRepository(Permission);
  }

  async upsert(code: string, description: string): Promise<Permission> {
    const existing = await this.repo.findOne({ where: { code } });
    if (existing) {
      existing.description = description;
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ code, description }));
  }

  async findByCode(code: string): Promise<Permission | null> {
    return this.repo.findOne({ where: { code } });
  }

  async findByCodes(codes: string[]): Promise<Permission[]> {
    if (codes.length === 0) return [];
    return this.repo.find({ where: { code: In(codes) } });
  }
}

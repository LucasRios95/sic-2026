import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { CreateTenantData, ITenantRepository } from '../../../repositories/ITenantRepository';
import { Tenant } from '../entities/Tenant';

export class TenantRepository implements ITenantRepository {
  private readonly repo: Repository<Tenant>;

  constructor() {
    this.repo = appDataSource.getRepository(Tenant);
  }

  async create(data: CreateTenantData): Promise<Tenant> {
    const tenant = this.repo.create(data);
    return this.repo.save(tenant);
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { slug } });
  }
}

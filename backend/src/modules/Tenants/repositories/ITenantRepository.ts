import { Tenant } from '../infra/typeorm/entities/Tenant';

export interface CreateTenantData {
  name: string;
  slug: string;
}

export interface ITenantRepository {
  create(data: CreateTenantData): Promise<Tenant>;
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
}

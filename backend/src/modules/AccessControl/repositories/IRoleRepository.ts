import { Role } from '../infra/typeorm/entities/Role';

export interface CreateRoleData {
  tenantId: string;
  name: string;
  description?: string | null;
  system?: boolean;
}

export interface IRoleRepository {
  create(data: CreateRoleData): Promise<Role>;
  findById(id: string): Promise<Role | null>;
  findByName(tenantId: string, name: string): Promise<Role | null>;
}

import { Permission } from '../infra/typeorm/entities/Permission';

export interface IPermissionRepository {
  upsert(code: string, description: string): Promise<Permission>;
  findByCode(code: string): Promise<Permission | null>;
  findByCodes(codes: string[]): Promise<Permission[]>;
}

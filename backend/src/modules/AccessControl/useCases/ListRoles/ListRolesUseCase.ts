import { inject, injectable } from 'tsyringe';

import { Role } from '../../infra/typeorm/entities/Role';
import { IRoleRepository } from '../../repositories/IRoleRepository';

/** Lista os papéis disponíveis no tenant, para atribuição a usuários por empresa. */
@injectable()
export class ListRolesUseCase {
  constructor(
    @inject('RoleRepository')
    private readonly roleRepository: IRoleRepository,
  ) {}

  async execute(tenantId: string): Promise<Role[]> {
    return this.roleRepository.listByTenant(tenantId);
  }
}

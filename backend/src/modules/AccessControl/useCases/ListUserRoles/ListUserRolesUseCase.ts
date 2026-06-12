import { inject, injectable } from 'tsyringe';

import { IUserRepository } from '@modules/Users/repositories/IUserRepository';
import { NotFoundError } from '@shared/errors';

import { GLOBAL_COMPANY_ID } from '../../infra/typeorm/entities/UserRole';
import { IUserRoleRepository } from '../../repositories/IUserRoleRepository';

export interface UserRoleAssignment {
  roleId: string;
  roleName: string;
  /** null = papel global (todas as empresas do tenant). */
  companyId: string | null;
  companyName: string | null;
}

/** Vínculos papel×empresa de um usuário. Valida que o usuário pertence ao tenant do ator. */
@injectable()
export class ListUserRolesUseCase {
  constructor(
    @inject('UserRepository')
    private readonly userRepository: IUserRepository,

    @inject('UserRoleRepository')
    private readonly userRoleRepository: IUserRoleRepository,
  ) {}

  async execute(tenantId: string, userId: string): Promise<UserRoleAssignment[]> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundError('Usuário não encontrado');
    }

    const links = await this.userRoleRepository.findByUser(userId);
    return links.map((l) => {
      const isGlobal = l.companyId === GLOBAL_COMPANY_ID;
      return {
        roleId: l.roleId,
        roleName: l.role?.name ?? '—',
        companyId: isGlobal ? null : l.companyId,
        companyName: isGlobal ? null : (l.company?.nomeFantasia ?? l.company?.razaoSocial ?? '—'),
      };
    });
  }
}

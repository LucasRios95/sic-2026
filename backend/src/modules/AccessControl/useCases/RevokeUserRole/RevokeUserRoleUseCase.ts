import { inject, injectable } from 'tsyringe';

import { IUserRepository } from '@modules/Users/repositories/IUserRepository';
import { NotFoundError } from '@shared/errors';

import { GLOBAL_COMPANY_ID } from '../../infra/typeorm/entities/UserRole';
import { IUserRoleRepository } from '../../repositories/IUserRoleRepository';

interface IRequest {
  tenantId: string;
  userId: string;
  roleId: string;
  companyId?: string | null;
}

/** Remove um vínculo papel×empresa do usuário (revoga o acesso correspondente). */
@injectable()
export class RevokeUserRoleUseCase {
  constructor(
    @inject('UserRepository')
    private readonly userRepository: IUserRepository,

    @inject('UserRoleRepository')
    private readonly userRoleRepository: IUserRoleRepository,
  ) {}

  async execute({ tenantId, userId, roleId, companyId }: IRequest): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundError('Usuário não encontrado');
    }
    await this.userRoleRepository.revoke({
      userId,
      roleId,
      companyId: companyId ?? GLOBAL_COMPANY_ID,
    });
  }
}

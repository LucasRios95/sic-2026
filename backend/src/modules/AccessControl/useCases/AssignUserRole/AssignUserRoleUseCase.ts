import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { IUserRepository } from '@modules/Users/repositories/IUserRepository';
import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { GLOBAL_COMPANY_ID } from '../../infra/typeorm/entities/UserRole';
import { IRoleRepository } from '../../repositories/IRoleRepository';
import { IUserRoleRepository } from '../../repositories/IUserRoleRepository';

interface IRequest {
  tenantId: string;
  userId: string;
  roleId: string;
  /** null/ausente = papel global (todas as empresas do tenant). */
  companyId?: string | null;
}

/**
 * Concede a um usuário um papel escopado a uma empresa (ou global ao tenant). É assim que
 * se controla "quais empresas o usuário acessa": ter qualquer papel numa empresa = acesso.
 * Valida que usuário, papel e empresa pertencem ao MESMO tenant (barra acesso cruzado).
 */
@injectable()
export class AssignUserRoleUseCase {
  constructor(
    @inject('UserRepository')
    private readonly userRepository: IUserRepository,

    @inject('RoleRepository')
    private readonly roleRepository: IRoleRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('UserRoleRepository')
    private readonly userRoleRepository: IUserRoleRepository,
  ) {}

  async execute({ tenantId, userId, roleId, companyId }: IRequest): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundError('Usuário não encontrado');
    }

    const role = await this.roleRepository.findById(roleId);
    if (!role || role.tenantId !== tenantId) {
      throw new NotFoundError('Papel não encontrado');
    }

    const isGlobal = !companyId || companyId === GLOBAL_COMPANY_ID;
    if (!isGlobal) {
      const company = await this.companyRepository.findById(companyId!);
      if (!company || company.tenantId !== tenantId) {
        throw new BusinessRuleError('Empresa inválida para este tenant', 'INVALID_COMPANY');
      }
    }

    await this.userRoleRepository.assign({
      userId,
      roleId,
      companyId: isGlobal ? GLOBAL_COMPANY_ID : companyId,
    });
  }
}

import { inject, injectable } from 'tsyringe';

import { User } from '../../infra/typeorm/entities/User';
import { IUserRepository } from '../../repositories/IUserRepository';

/**
 * Lista os usuários de um tenant. A gestão de "quais empresas o usuário acessa" é feita
 * via papéis por empresa (UserRole) — ver os use cases de AccessControl.
 */
@injectable()
export class ListUsersUseCase {
  constructor(
    @inject('UserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(tenantId: string): Promise<User[]> {
    return this.userRepository.listByTenant(tenantId);
  }
}

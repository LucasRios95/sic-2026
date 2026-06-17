import { inject, injectable } from 'tsyringe';

import { IHashProvider } from '@shared/container/providers/HashProvider/IHashProvider';
import { NotFoundError } from '@shared/errors';

import { User } from '../../infra/typeorm/entities/User';
import { IUserRepository } from '../../repositories/IUserRepository';

interface IRequest {
  userId: string;
  tenantId: string;
  fullName?: string;
  active?: boolean;
  /** Quando presente, redefine a senha (re-hash). Ausente = mantém a atual. */
  password?: string;
}

@injectable()
export class UpdateUserUseCase {
  constructor(
    @inject('UserRepository')
    private readonly userRepository: IUserRepository,

    @inject('HashProvider')
    private readonly hashProvider: IHashProvider,
  ) {}

  async execute({ userId, tenantId, fullName, active, password }: IRequest): Promise<User> {
    const user = await this.userRepository.findById(userId);
    // Isolamento por tenant: nunca deixa editar usuário de outro tenant.
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundError('Usuário não encontrado');
    }

    if (fullName !== undefined) user.fullName = fullName;
    if (active !== undefined) user.active = active;
    if (password !== undefined) {
      user.passwordHash = await this.hashProvider.generateHash(password);
      // Redefinição manual de senha zera bloqueio por tentativas falhas.
      user.failedLogins = 0;
      user.lockedUntil = null;
    }

    return this.userRepository.save(user);
  }
}

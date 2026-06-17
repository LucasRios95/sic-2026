import { inject, injectable } from 'tsyringe';

import { IUserRepository } from '@modules/Users/repositories/IUserRepository';
import { IHashProvider } from '@shared/container/providers/HashProvider/IHashProvider';
import { BusinessRuleError, NotFoundError } from '@shared/errors';

interface IRequest {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

@injectable()
export class ChangePasswordUseCase {
  constructor(
    @inject('UserRepository')
    private readonly userRepository: IUserRepository,

    @inject('HashProvider')
    private readonly hashProvider: IHashProvider,
  ) {}

  async execute({ userId, currentPassword, newPassword }: IRequest): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado');

    // Exige a senha atual: troca por sessão sequestrada não basta — precisa conhecer a senha.
    // BusinessRuleError (não Unauthorized): um 401 faria o front deslogar o usuário (api.ts).
    const ok = await this.hashProvider.compareHash(currentPassword, user.passwordHash);
    if (!ok) throw new BusinessRuleError('Senha atual incorreta', 'CURRENT_PASSWORD_INVALID');

    user.passwordHash = await this.hashProvider.generateHash(newPassword);
    user.failedLogins = 0;
    user.lockedUntil = null;
    await this.userRepository.save(user);
  }
}

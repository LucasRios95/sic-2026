import { inject, injectable } from 'tsyringe';

import { ITenantRepository } from '@modules/Tenants/repositories/ITenantRepository';
import { IHashProvider } from '@shared/container/providers/HashProvider/IHashProvider';
import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { User } from '../../infra/typeorm/entities/User';
import { IUserRepository } from '../../repositories/IUserRepository';

interface IRequest {
  tenantId: string;
  email: string;
  fullName: string;
  password: string;
}

@injectable()
export class CreateUserUseCase {
  constructor(
    @inject('UserRepository')
    private readonly userRepository: IUserRepository,

    @inject('TenantRepository')
    private readonly tenantRepository: ITenantRepository,

    @inject('HashProvider')
    private readonly hashProvider: IHashProvider,
  ) {}

  async execute({ tenantId, email, fullName, password }: IRequest): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();

    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) throw new NotFoundError('Tenant não encontrado');

    const existing = await this.userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new BusinessRuleError('Já existe um usuário com este e-mail', 'USER_EMAIL_DUPLICATE');
    }

    const passwordHash = await this.hashProvider.generateHash(password);

    return this.userRepository.create({
      tenantId,
      email: normalizedEmail,
      fullName,
      passwordHash,
    });
  }
}

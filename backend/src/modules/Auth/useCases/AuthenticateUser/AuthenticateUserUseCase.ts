import dayjs from 'dayjs';
import { inject, injectable } from 'tsyringe';

import { IUserRoleRepository } from '@modules/AccessControl/repositories/IUserRoleRepository';
import { IRefreshTokenRepository } from '@modules/Users/repositories/IRefreshTokenRepository';
import { IUserRepository } from '@modules/Users/repositories/IUserRepository';
import { authConfig } from '@config/auth';
import { IHashProvider } from '@shared/container/providers/HashProvider/IHashProvider';
import { ITokenProvider } from '@shared/container/providers/TokenProvider/ITokenProvider';
import { AccountLockedError, UnauthorizedError } from '@shared/errors';
import { logger } from '@shared/logger';

interface IRequest {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

interface IResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    tenantId: string;
    roles: string[];
    permissions: string[];
    accessibleCompanyIds: string[];
  };
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@injectable()
export class AuthenticateUserUseCase {
  constructor(
    @inject('UserRepository')
    private readonly userRepository: IUserRepository,

    @inject('RefreshTokenRepository')
    private readonly refreshTokenRepository: IRefreshTokenRepository,

    @inject('UserRoleRepository')
    private readonly userRoleRepository: IUserRoleRepository,

    @inject('HashProvider')
    private readonly hashProvider: IHashProvider,

    @inject('TokenProvider')
    private readonly tokenProvider: ITokenProvider,
  ) {}

  /**
   * Login com proteção contra brute force:
   * - cada credencial errada incrementa failedLogins
   * - após LOGIN_MAX_ATTEMPTS tentativas falhas, a conta fica bloqueada por
   *   LOGIN_LOCK_DURATION_MINUTES; nesse intervalo, retorna 423 sem revelar
   *   se a senha estaria certa.
   * - login bem-sucedido zera o contador.
   */
  async execute({ email, password, userAgent, ipAddress }: IRequest): Promise<IResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    // Mensagem de erro genérica em caso de email inexistente: não vazar enumeração.
    if (!user) {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    if (!user.active) {
      throw new UnauthorizedError('Usuário inativo');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = dayjs(user.lockedUntil).diff(dayjs(), 'minute') + 1;
      throw new AccountLockedError(
        `Conta bloqueada por excesso de tentativas. Tente novamente em ${minutes} minuto(s).`,
      );
    }

    const passwordOk = await this.hashProvider.compareHash(password, user.passwordHash);

    if (!passwordOk) {
      user.failedLogins += 1;
      if (user.failedLogins >= authConfig.login.maxAttempts) {
        user.lockedUntil = dayjs()
          .add(authConfig.login.lockDurationMinutes, 'minute')
          .toDate();
        logger.warn({ userId: user.id }, 'Usuário bloqueado por excesso de tentativas');
      }
      await this.userRepository.save(user);
      throw new UnauthorizedError('Credenciais inválidas');
    }

    // Sucesso — zera contadores e atualiza lastLogin.
    user.failedLogins = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const context = await this.userRoleRepository.loadContextForUser(user.id);

    const accessToken = this.tokenProvider.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
    });

    const refreshTokenValue = this.tokenProvider.generateRefreshTokenValue();
    const refreshTokenExpiresAt = this.tokenProvider.refreshTokenExpiresAt();
    await this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: this.tokenProvider.hashRefreshToken(refreshTokenValue),
      expiresAt: refreshTokenExpiresAt,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        roles: context.roles,
        permissions: context.permissions,
        accessibleCompanyIds: context.accessibleCompanyIds,
      },
      accessToken,
      refreshToken: refreshTokenValue,
      refreshTokenExpiresAt,
    };
  }
}

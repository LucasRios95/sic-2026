import { inject, injectable } from 'tsyringe';

import { IUserRoleRepository } from '@modules/AccessControl/repositories/IUserRoleRepository';
import { IRefreshTokenRepository } from '@modules/Users/repositories/IRefreshTokenRepository';
import { IUserRepository } from '@modules/Users/repositories/IUserRepository';
import { ITokenProvider } from '@shared/container/providers/TokenProvider/ITokenProvider';
import { UnauthorizedError } from '@shared/errors';

interface IRequest {
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
}

interface IResponse {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@injectable()
export class RefreshTokenUseCase {
  constructor(
    @inject('RefreshTokenRepository')
    private readonly refreshTokenRepository: IRefreshTokenRepository,

    @inject('UserRepository')
    private readonly userRepository: IUserRepository,

    @inject('UserRoleRepository')
    private readonly userRoleRepository: IUserRoleRepository,

    @inject('TokenProvider')
    private readonly tokenProvider: ITokenProvider,
  ) {}

  /**
   * Rotação de refresh token: cada chamada revoga o token usado e emite outro. Isso limita
   * a janela de exposição em caso de roubo do token armazenado no navegador.
   */
  async execute({ refreshToken, userAgent, ipAddress }: IRequest): Promise<IResponse> {
    const tokenHash = this.tokenProvider.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepository.findActiveByHash(tokenHash);

    if (!stored) {
      throw new UnauthorizedError('Refresh token inválido ou expirado');
    }

    const user = await this.userRepository.findById(stored.userId);
    if (!user || !user.active) {
      // Token órfão ou usuário desativado — revoga tudo para ser seguro.
      await this.refreshTokenRepository.revokeAllForUser(stored.userId);
      throw new UnauthorizedError('Usuário inativo');
    }

    await this.refreshTokenRepository.revoke(stored.id);

    const accessToken = this.tokenProvider.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
    });

    const newRefreshTokenValue = this.tokenProvider.generateRefreshTokenValue();
    const refreshTokenExpiresAt = this.tokenProvider.refreshTokenExpiresAt();
    await this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: this.tokenProvider.hashRefreshToken(newRefreshTokenValue),
      expiresAt: refreshTokenExpiresAt,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
    });

    return {
      accessToken,
      refreshToken: newRefreshTokenValue,
      refreshTokenExpiresAt,
    };
  }
}

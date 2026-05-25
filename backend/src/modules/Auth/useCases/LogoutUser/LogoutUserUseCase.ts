import { inject, injectable } from 'tsyringe';

import { IRefreshTokenRepository } from '@modules/Users/repositories/IRefreshTokenRepository';
import { ITokenProvider } from '@shared/container/providers/TokenProvider/ITokenProvider';

interface IRequest {
  refreshToken: string;
}

@injectable()
export class LogoutUserUseCase {
  constructor(
    @inject('RefreshTokenRepository')
    private readonly refreshTokenRepository: IRefreshTokenRepository,

    @inject('TokenProvider')
    private readonly tokenProvider: ITokenProvider,
  ) {}

  /**
   * Idempotente: logout com token já revogado não é erro do cliente.
   * O access token JWT continua válido até o exp; em fluxos sensíveis,
   * o frontend deve apagar o access token local imediatamente.
   */
  async execute({ refreshToken }: IRequest): Promise<void> {
    const tokenHash = this.tokenProvider.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepository.findActiveByHash(tokenHash);
    if (stored) {
      await this.refreshTokenRepository.revoke(stored.id);
    }
  }
}

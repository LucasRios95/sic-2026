import crypto from 'node:crypto';

import { sign, verify } from 'jsonwebtoken';

import { authConfig } from '@config/auth';
import { UnauthorizedError } from '@shared/errors';

import { AccessTokenPayload, ITokenProvider } from '../ITokenProvider';

const REFRESH_TOKEN_BYTES = 48;

export class JwtTokenProvider implements ITokenProvider {
  signAccessToken(payload: AccessTokenPayload): string {
    const { sub, ...rest } = payload;
    return sign(rest, authConfig.jwt.secret, {
      subject: sub,
      expiresIn: authConfig.jwt.accessTokenExpiresIn as unknown as number,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = verify(token, authConfig.jwt.secret) as {
        sub: string;
        tenantId: string;
        email: string;
      };
      return { sub: decoded.sub, tenantId: decoded.tenantId, email: decoded.email };
    } catch {
      throw new UnauthorizedError('Token inválido ou expirado');
    }
  }

  /**
   * Refresh tokens são opacos (não JWT). Um cliente recebe o valor cru; armazenamos
   * apenas o hash SHA-256 para que, mesmo vazamento de banco, o token bruto não seja
   * recuperável.
   */
  generateRefreshTokenValue(): string {
    return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  hashRefreshToken(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  refreshTokenExpiresAt(): Date {
    const expiresIn = authConfig.jwt.refreshTokenExpiresIn;
    const ms = parseDurationMs(expiresIn);
    return new Date(Date.now() + ms);
  }
}

/**
 * Converte "7d", "15m", "1h" etc. em milissegundos. Sintaxe enxuta porque jsonwebtoken
 * já aceita o mesmo formato em strings; aqui só precisamos do timestamp absoluto.
 */
function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Duração inválida: ${duration}`);
  const [, n, unit] = match;
  const value = Number(n);
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

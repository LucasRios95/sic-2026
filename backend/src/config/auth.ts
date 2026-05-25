import { env } from './env';

export const authConfig = {
  jwt: {
    secret: env.JWT_SECRET,
    accessTokenExpiresIn: env.JWT_ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresIn: env.JWT_REFRESH_TOKEN_EXPIRES_IN,
  },
  password: {
    bcryptCost: env.BCRYPT_COST,
  },
  login: {
    maxAttempts: env.LOGIN_MAX_ATTEMPTS,
    lockDurationMinutes: env.LOGIN_LOCK_DURATION_MINUTES,
  },
} as const;

import pino, { Logger } from 'pino';

import { env } from '@config/env';

import { getRequestContext } from '../context/request-context';

const isDev = env.NODE_ENV === 'development';

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'sic-2026-backend' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'password', 'senha', 'passwordHash', '*.password'],
    censor: '[REDACTED]',
  },
  // Logs estruturados JSON em produção; bonitos em dev.
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      }
    : undefined,
  // Cada linha de log que cruza o request inclui automaticamente os identificadores do contexto.
  mixin() {
    const ctx = getRequestContext();
    if (!ctx) return {};
    return {
      requestId: ctx.requestId,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
    };
  },
});

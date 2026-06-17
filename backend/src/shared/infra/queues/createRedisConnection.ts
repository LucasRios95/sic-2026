import Redis, { RedisOptions } from 'ioredis';

import { env } from '@config/env';

/**
 * Cria a conexão ioredis das filas (BullMQ). Aceita:
 *  - `REDIS_URL` única (ex.: Railway: `REDIS_URL=${{Redis.REDIS_PRIVATE_URL}}`) — precedência; ou
 *  - as variáveis discretas `REDIS_HOST/PORT/PASSWORD/DB` (dev/on-premise).
 *
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ nas conexões de worker/compartilhadas;
 * `extra` permite opções adicionais por chamada (ex.: `lazyConnect` no producer).
 */
export function createRedisConnection(extra: RedisOptions = {}): Redis {
  const base: RedisOptions = { maxRetriesPerRequest: null, ...extra };
  if (env.REDIS_URL) {
    return new Redis(env.REDIS_URL, base);
  }
  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    ...base,
  });
}

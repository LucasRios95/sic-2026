import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1),
  DB_PASS: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_SCHEMA: z.string().default('public'),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_SYNCHRONIZE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_LOGGING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_DURATION_MINUTES: z.coerce.number().int().positive().default(15),

  CORS_ALLOWED_ORIGINS: z.string().default(''),

  // --- Redis / BullMQ ---
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  QUEUE_PREFIX: z.string().min(1).default('sic2026'),

  // --- Cofre de segredos ---
  VAULT_DRIVER: z.enum(['memory', 'filesystem']).default('memory'),
  VAULT_PATH: z.string().default('./tmp/vault'),
  // 32 bytes em base64 (44 chars). Validamos só o tamanho mínimo; a leitura real do segredo
  // ocorre no adapter e falha com mensagem específica se for inválida.
  VAULT_MASTER_KEY: z.string().optional().default(''),

  // --- OpenTelemetry (opt-in) ---
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default(''),
  OTEL_SERVICE_NAME: z.string().default('sic-2026-backend'),

  // --- Storage de documentos (DANFE PDF, XML) ---
  STORAGE_DRIVER: z.enum(['filesystem', 's3']).default('filesystem'),
  STORAGE_PATH: z.string().default('./tmp/docs'),

  // --- E-mail (SMTP) ---
  MAIL_HOST: z.string().optional().default(''),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_USER: z.string().optional().default(''),
  MAIL_PASS: z.string().optional().default(''),
  MAIL_FROM_NAME: z.string().default('Sistema Fiscal SIC 2026'),
  MAIL_FROM_ADDRESS: z.string().email().default('no-reply@example.com'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Falha cedo: se o env é inválido, a aplicação não deve subir.
  // Critério: variáveis fiscais e de segurança ausentes geram falha silenciosa em produção.
  console.error('Configuração de ambiente inválida:');
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Variáveis de ambiente inválidas — corrija o .env e tente novamente.');
}

export const env = {
  ...parsed.data,
  corsAllowedOrigins: parsed.data.CORS_ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
} as const;

export type Env = typeof env;

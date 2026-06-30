import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  APP_BUILD_SHA: z.string().optional().default('unknown'),
  APP_BUILD_SOURCE: z.string().optional().default('unknown'),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional().default(''),
  RAILWAY_SERVICE_NAME: z.string().optional().default(''),

  // URL única de conexão (ex.: Railway: DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}).
  // Quando definida, tem precedência sobre as variáveis discretas DB_* abaixo.
  DATABASE_URL: z.string().optional().default(''),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  // Opcionais porque DATABASE_URL pode supri-las; um refine garante "URL OU trio discreto".
  DB_USER: z.string().optional().default(''),
  DB_PASS: z.string().optional().default(''),
  DB_NAME: z.string().optional().default(''),
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
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_DURATION_MINUTES: z.coerce.number().int().positive().default(15),

  CORS_ALLOWED_ORIGINS: z.string().default(''),

  // --- Redis / BullMQ ---
  // URL única do Redis (ex.: Railway: REDIS_URL=${{Redis.REDIS_PRIVATE_URL}}). Precede REDIS_*.
  REDIS_URL: z.string().optional().default(''),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  QUEUE_PREFIX: z.string().min(1).default('sic2026'),

  // --- Cofre de segredos ---
  VAULT_DRIVER: z.enum(['memory', 'filesystem', 'db']).default('memory'),
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

  // --- Serviço único (Railway): o backend também serve o build do frontend (SPA) ---
  // Caminho do `dist` do frontend dentro da imagem. Vazio = desligado (dev/on-premise,
  // onde o nginx serve o front). Setado pelo Dockerfile da raiz (ex.: /app/public).
  SERVE_FRONTEND_DIR: z.string().optional().default(''),

  // --- Recepção automática DF-e no processo HTTP (serviço único/Railway) ---
  RECEPCAO_AUTO_SYNC: z.enum(['on', 'off']).default('off'),
  RECEPCAO_AUTO_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(30).default(60),
  RECEPCAO_AUTO_SYNC_MAX_ITERATIONS: z.coerce.number().int().positive().max(50).default(10),

  // --- Validação XSD da NF-e (antes de assinar/transmitir) ---
  // block: XML inválido vira rejeição local, sem ir à SEFAZ (default).
  // warn:  loga os erros mas transmite mesmo assim (observação).
  // off:   desliga a validação. Útil se o XSD local ficar atrás do schema de produção.
  NFE_XSD_VALIDATION: z.enum(['block', 'warn', 'off']).default('block'),
  // Override do caminho do XSD de entrada (nfe_v4.00.xsd). Vazio = pacote vendorizado padrão.
  NFE_SCHEMA_PATH: z.string().optional().default(''),

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
}).superRefine((cfg, ctx) => {
  // Banco: aceita DATABASE_URL única OU o trio discreto DB_USER/DB_PASS/DB_NAME.
  if (!cfg.DATABASE_URL && !(cfg.DB_USER && cfg.DB_PASS && cfg.DB_NAME)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message: 'Defina DATABASE_URL OU as três variáveis DB_USER, DB_PASS e DB_NAME.',
    });
  }
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

import 'reflect-metadata';

import path from 'node:path';

import { DataSource, DataSourceOptions } from 'typeorm';

import { env } from '@config/env';

/**
 * DataSource único do sistema. Sem `synchronize` em produção (controlamos via migrations).
 * O glob de entidades e migrations resolve tanto no runtime de desenvolvimento (tsx em .ts)
 * quanto no build (tsc em .js compilado para ./dist).
 */
const isCompiled = __filename.endsWith('.js');
const ext = isCompiled ? 'js' : 'ts';
const rootDir = isCompiled
  ? path.resolve(__dirname, '..', '..', '..')
  : path.resolve(__dirname, '..', '..', '..', 'src');

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  schema: env.DB_SCHEMA,
  synchronize: env.DB_SYNCHRONIZE,
  logging: env.DB_LOGGING,
  entities: [path.join(rootDir, 'modules', '**', 'infra', 'typeorm', 'entities', `*.${ext}`)],
  migrations: [path.join(rootDir, 'shared', 'infra', 'typeorm', 'migrations', `*.${ext}`)],
  migrationsTableName: 'typeorm_migrations',
  extra: {
    min: env.DB_POOL_MIN,
    max: env.DB_POOL_MAX,
  },
};

export const appDataSource = new DataSource(dataSourceOptions);

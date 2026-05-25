import 'reflect-metadata';
import '@shared/types/express';

import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';

import { env } from '@config/env';
import { registerDependencies } from '@shared/container';

import { errorHandler } from './middlewares/errorHandler';
import { requestContextMiddleware } from './middlewares/requestContext';
import { router } from './routes';

/**
 * Configura a app Express sem subir o servidor. Útil para testes integrados
 * que importam `app` diretamente via Supertest sem ocupar uma porta.
 */
export function createApp(): Express {
  registerDependencies();

  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (env.NODE_ENV === 'development' && origin.includes('localhost')) {
          return callback(null, true);
        }
        if (env.corsAllowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origem ${origin} não permitida pelo CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(requestContextMiddleware);

  app.use(router);

  // Express 5 propaga erros async automaticamente para o middleware abaixo.
  app.use(errorHandler);

  return app;
}

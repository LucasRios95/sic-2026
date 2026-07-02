import 'reflect-metadata';

// As augmentações do Express.Request (user, companyId, validatedQuery) ficam em
// `shared/types/express.d.ts`. Não importamos o arquivo aqui de propósito — o tsc
// já o carrega via `tsconfig.include` (que casa com .d.ts), e o tsx em runtime
// ignora arquivos .d.ts. Importar explicitamente quebra o tsx.
import path from 'node:path';

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
  app.use(
    helmet({
      // O espelho DANFE é exibido em <iframe src="blob:..."> (PDF gerado no cliente, mesma
      // origem). O CSP padrão do helmet faz frame-src/object-src caírem em default-src 'self',
      // que bloqueia blob: — daí o "conteúdo bloqueado" no iframe. Liberamos blob: só nesses
      // dois diretivos; os demais defaults do helmet são preservados (useDefaults: true).
      contentSecurityPolicy: {
        directives: {
          'frame-src': ["'self'", 'blob:'],
          'object-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
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
  // Alias `/api` para as MESMAS rotas. No modo serviço único (Railway) o próprio backend
  // serve o SPA e o front chama `/api/*` (mesma origem). No on-premise/dev o nginx faz o
  // strip de `/api` e usa as rotas na raiz — então este alias fica ocioso lá, sem efeito.
  app.use('/api', router);

  // Serviço único (Railway): o backend também serve o build estático do frontend (SPA).
  // Ativado só quando SERVE_FRONTEND_DIR aponta para o `dist` (setado no Dockerfile da raiz).
  // No on-premise/dev fica desligado (o nginx serve o front). Precisa vir DEPOIS das rotas
  // de API e ANTES do errorHandler.
  if (env.SERVE_FRONTEND_DIR) {
    const dist = path.resolve(env.SERVE_FRONTEND_DIR);
    app.use(express.static(dist));
    // Fallback de SPA: qualquer GET que não seja de API e não casou com arquivo estático
    // devolve o index.html (o TanStack Router resolve a rota no cliente).
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(dist, 'index.html'));
      } else {
        next();
      }
    });
  }

  // Express 5 propaga erros async automaticamente para o middleware abaixo.
  app.use(errorHandler);

  return app;
}

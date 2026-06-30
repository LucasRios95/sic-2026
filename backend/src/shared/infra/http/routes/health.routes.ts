import { Request, Response, Router } from 'express';

import { env } from '@config/env';
import { appDataSource } from '@shared/infra/typeorm/data-source';

export const healthRoutes = Router();

healthRoutes.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'sic-2026-backend',
    build: {
      sha: env.RAILWAY_GIT_COMMIT_SHA || env.APP_BUILD_SHA,
      source: env.RAILWAY_SERVICE_NAME || env.APP_BUILD_SOURCE,
      serveFrontendDir: env.SERVE_FRONTEND_DIR || null,
    },
  });
});

healthRoutes.get('/ready', async (_req: Request, res: Response) => {
  try {
    await appDataSource.query('SELECT 1');
    res.json({ status: 'ready', db: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'not-ready', db: 'error', message: (err as Error).message });
  }
});

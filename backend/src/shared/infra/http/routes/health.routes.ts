import { Request, Response, Router } from 'express';

import { appDataSource } from '@shared/infra/typeorm/data-source';

export const healthRoutes = Router();

healthRoutes.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'sic-2026-backend' });
});

healthRoutes.get('/ready', async (_req: Request, res: Response) => {
  try {
    await appDataSource.query('SELECT 1');
    res.json({ status: 'ready', db: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'not-ready', db: 'error', message: (err as Error).message });
  }
});

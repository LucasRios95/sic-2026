import { Router } from 'express';

import { ListCfopsController } from '@modules/Cfop/useCases/ListCfops/ListCfopsController';
import { UpsertCfopController } from '@modules/Cfop/useCases/UpsertCfop/UpsertCfopController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { validate } from '@shared/infra/http/middlewares/validate';

import { listCfopsQuerySchema, upsertCfopSchema } from '../validators/cfopValidators';

export const cfopsRoutes = Router();

const listController = new ListCfopsController();
const upsertController = new UpsertCfopController();

cfopsRoutes.use(requireAuth);

cfopsRoutes.get(
  '/',
  requirePermission('catalog.read', 'nfe.read', 'nfe.emit', 'admin.full'),
  validate({ query: listCfopsQuerySchema }),
  (req, res) => listController.handle(req, res),
);

cfopsRoutes.post(
  '/',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: upsertCfopSchema }),
  (req, res) => upsertController.handle(req, res),
);

cfopsRoutes.put(
  '/:codigo',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: upsertCfopSchema }),
  (req, res) => upsertController.handle(req, res),
);

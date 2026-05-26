import { Router } from 'express';

import { GetNcmController } from '@modules/Ncm/useCases/GetNcm/GetNcmController';
import { ListNcmsController } from '@modules/Ncm/useCases/ListNcms/ListNcmsController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { validate } from '@shared/infra/http/middlewares/validate';

import { listNcmsQuerySchema } from '../validators/ncmValidators';

export const ncmsRoutes = Router();

const listController = new ListNcmsController();
const getController = new GetNcmController();

// Catálogo NCM é referência fiscal — qualquer usuário autenticado com leitura de catálogo
// pode consultar (autocomplete em formulários de produto, NF-e, etc.).
ncmsRoutes.use(requireAuth);

ncmsRoutes.get(
  '/',
  requirePermission('catalog.read', 'nfe.read', 'nfe.emit', 'admin.full'),
  validate({ query: listNcmsQuerySchema }),
  (req, res) => listController.handle(req, res),
);

ncmsRoutes.get(
  '/:codigo',
  requirePermission('catalog.read', 'nfe.read', 'nfe.emit', 'admin.full'),
  (req, res) => getController.handle(req, res),
);

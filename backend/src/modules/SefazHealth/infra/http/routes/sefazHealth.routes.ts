import { Router } from 'express';
import { z } from 'zod';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { validate } from '@shared/infra/http/middlewares/validate';

import { ListSefazHealthController } from '../../../useCases/ListSefazHealth/ListSefazHealthController';
import { ProbeSefazHealthController } from '../../../useCases/ProbeSefazHealth/ProbeSefazHealthController';

export const sefazHealthRoutes = Router();

const listController = new ListSefazHealthController();
const probeController = new ProbeSefazHealthController();

const probeSchema = z.object({
  ambiente: z.nativeEnum(AmbienteSefaz).optional(),
});

// Sem `tenantContext` obrigatório: o status é cross-tenant — todos os usuários autenticados
// com permissão de leitura conseguem ver o dashboard.
sefazHealthRoutes.use(requireAuth);

sefazHealthRoutes.get(
  '/',
  requirePermission('nfe.read', 'nfe.emit', 'admin.full'),
  (req, res) => listController.handle(req, res),
);

// Probe manual — operação administrativa. Sob carga, idealmente seria assíncrona via
// fila; nesta versão é síncrona (~5-15s por ambiente). Limitar a admins.
sefazHealthRoutes.post(
  '/probe',
  requirePermission('admin.full'),
  validate({ body: probeSchema }),
  (req, res) => probeController.handle(req, res),
);

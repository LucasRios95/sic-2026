import { Router } from 'express';

import { ListAuditLogsController } from '@modules/Auditoria/useCases/ListAuditLogs/ListAuditLogsController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import { listAuditLogsQuerySchema } from '../validators/auditValidators';

export const auditoriaRoutes = Router();

const listController = new ListAuditLogsController();

// Auditoria é acessível com `audit.read` (admin do tenant) ou `admin.full`. O tenantContext
// é opcional aqui porque o admin pode querer ver logs sem escopo de empresa (ex.: login).
auditoriaRoutes.use(requireAuth, tenantContext({ required: false }));

auditoriaRoutes.get(
  '/',
  requirePermission('audit.read', 'admin.full'),
  validate({ query: listAuditLogsQuerySchema }),
  (req, res) => listController.handle(req, res),
);

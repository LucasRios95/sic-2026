import { Router } from 'express';

import { GetReportController } from '@modules/Reports/useCases/GetReport/GetReportController';
import { ReportType } from '@modules/Reports/useCases/GetReport/GetReportUseCase';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import { reportQuerySchema } from '../validators/reportValidators';

export const reportsRoutes = Router();

const controller = new GetReportController();
const types: ReportType[] = ['faturamento', 'apuracao', 'entradas', 'rankings'];

reportsRoutes.use(requireAuth, tenantContext({ required: true }));

for (const type of types) {
  reportsRoutes.get(
    `/${type}`,
    requirePermission('nfe.read', 'fin.read', 'fin.*', 'admin.full'),
    validate({ query: reportQuerySchema }),
    (req, res) => controller.handle(type, req, res),
  );
}

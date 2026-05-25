import { Router } from 'express';

import { AddServiceTaxRuleController } from '@modules/Services/useCases/AddServiceTaxRule/AddServiceTaxRuleController';
import { CreateServiceController } from '@modules/Services/useCases/CreateService/CreateServiceController';
import { DeleteServiceController } from '@modules/Services/useCases/DeleteService/DeleteServiceController';
import { GetServiceController } from '@modules/Services/useCases/GetService/GetServiceController';
import { ListServicesController } from '@modules/Services/useCases/ListServices/ListServicesController';
import { UpdateServiceController } from '@modules/Services/useCases/UpdateService/UpdateServiceController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  createServiceSchema,
  listServicesQuerySchema,
  serviceTaxRuleSchema,
  updateServiceSchema,
} from '../validators/serviceValidators';

export const servicesRoutes = Router();

const create = new CreateServiceController();
const update = new UpdateServiceController();
const list = new ListServicesController();
const get = new GetServiceController();
const remove = new DeleteServiceController();
const addRule = new AddServiceTaxRuleController();

servicesRoutes.use(requireAuth, tenantContext({ required: true }));

servicesRoutes.get(
  '/',
  requirePermission('catalog.read', 'admin.full'),
  validate({ query: listServicesQuerySchema }),
  (req, res) => list.handle(req, res),
);
servicesRoutes.get('/:id', requirePermission('catalog.read', 'admin.full'), (req, res) =>
  get.handle(req, res),
);
servicesRoutes.post(
  '/',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: createServiceSchema }),
  (req, res) => create.handle(req, res),
);
servicesRoutes.put(
  '/:id',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: updateServiceSchema }),
  (req, res) => update.handle(req, res),
);
servicesRoutes.delete(
  '/:id',
  requirePermission('catalog.write', 'admin.full'),
  (req, res) => remove.handle(req, res),
);

servicesRoutes.post(
  '/:id/tax-rules',
  requirePermission('tax-rule.write', 'catalog.write', 'admin.full'),
  validate({ body: serviceTaxRuleSchema }),
  (req, res) => addRule.handle(req, res),
);

import { Router } from 'express';

import { CreateCustomerController } from '@modules/Customers/useCases/CreateCustomer/CreateCustomerController';
import { DeleteCustomerController } from '@modules/Customers/useCases/DeleteCustomer/DeleteCustomerController';
import { GetCustomerController } from '@modules/Customers/useCases/GetCustomer/GetCustomerController';
import { ListCustomersController } from '@modules/Customers/useCases/ListCustomers/ListCustomersController';
import { UpdateCustomerController } from '@modules/Customers/useCases/UpdateCustomer/UpdateCustomerController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '../validators/customerValidators';

export const customersRoutes = Router();

const create = new CreateCustomerController();
const update = new UpdateCustomerController();
const list = new ListCustomersController();
const get = new GetCustomerController();
const remove = new DeleteCustomerController();

customersRoutes.use(requireAuth, tenantContext({ required: true }));

customersRoutes.get(
  '/',
  requirePermission('catalog.read', 'admin.full'),
  validate({ query: listCustomersQuerySchema }),
  (req, res) => list.handle(req, res),
);
customersRoutes.get(
  '/:id',
  requirePermission('catalog.read', 'admin.full'),
  (req, res) => get.handle(req, res),
);
customersRoutes.post(
  '/',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: createCustomerSchema }),
  (req, res) => create.handle(req, res),
);
customersRoutes.put(
  '/:id',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: updateCustomerSchema }),
  (req, res) => update.handle(req, res),
);
customersRoutes.delete(
  '/:id',
  requirePermission('catalog.write', 'admin.full'),
  (req, res) => remove.handle(req, res),
);

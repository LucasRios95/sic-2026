import { Router } from 'express';

import { CreateSupplierController } from '@modules/Suppliers/useCases/CreateSupplier/CreateSupplierController';
import { DeleteSupplierController } from '@modules/Suppliers/useCases/DeleteSupplier/DeleteSupplierController';
import { GetSupplierController } from '@modules/Suppliers/useCases/GetSupplier/GetSupplierController';
import { ListSuppliersController } from '@modules/Suppliers/useCases/ListSuppliers/ListSuppliersController';
import { UpdateSupplierController } from '@modules/Suppliers/useCases/UpdateSupplier/UpdateSupplierController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  updateSupplierSchema,
} from '../validators/supplierValidators';

export const suppliersRoutes = Router();

const create = new CreateSupplierController();
const update = new UpdateSupplierController();
const list = new ListSuppliersController();
const get = new GetSupplierController();
const remove = new DeleteSupplierController();

suppliersRoutes.use(requireAuth, tenantContext({ required: true }));

suppliersRoutes.get(
  '/',
  requirePermission('catalog.read', 'admin.full'),
  validate({ query: listSuppliersQuerySchema }),
  (req, res) => list.handle(req, res),
);
suppliersRoutes.get('/:id', requirePermission('catalog.read', 'admin.full'), (req, res) =>
  get.handle(req, res),
);
suppliersRoutes.post(
  '/',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: createSupplierSchema }),
  (req, res) => create.handle(req, res),
);
suppliersRoutes.put(
  '/:id',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: updateSupplierSchema }),
  (req, res) => update.handle(req, res),
);
suppliersRoutes.delete(
  '/:id',
  requirePermission('catalog.write', 'admin.full'),
  (req, res) => remove.handle(req, res),
);

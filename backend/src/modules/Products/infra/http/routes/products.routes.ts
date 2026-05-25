import { Router } from 'express';

import { AddProductTaxRuleController } from '@modules/Products/useCases/AddProductTaxRule/AddProductTaxRuleController';
import { CreateProductController } from '@modules/Products/useCases/CreateProduct/CreateProductController';
import { DeleteProductController } from '@modules/Products/useCases/DeleteProduct/DeleteProductController';
import { GetProductController } from '@modules/Products/useCases/GetProduct/GetProductController';
import { ListProductsController } from '@modules/Products/useCases/ListProducts/ListProductsController';
import { UpdateProductController } from '@modules/Products/useCases/UpdateProduct/UpdateProductController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  createProductSchema,
  listProductsQuerySchema,
  productTaxRuleSchema,
  updateProductSchema,
} from '../validators/productValidators';

export const productsRoutes = Router();

const create = new CreateProductController();
const update = new UpdateProductController();
const list = new ListProductsController();
const get = new GetProductController();
const remove = new DeleteProductController();
const addRule = new AddProductTaxRuleController();

productsRoutes.use(requireAuth, tenantContext({ required: true }));

productsRoutes.get(
  '/',
  requirePermission('catalog.read', 'admin.full'),
  validate({ query: listProductsQuerySchema }),
  (req, res) => list.handle(req, res),
);
productsRoutes.get('/:id', requirePermission('catalog.read', 'admin.full'), (req, res) =>
  get.handle(req, res),
);
productsRoutes.post(
  '/',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: createProductSchema }),
  (req, res) => create.handle(req, res),
);
productsRoutes.put(
  '/:id',
  requirePermission('catalog.write', 'admin.full'),
  validate({ body: updateProductSchema }),
  (req, res) => update.handle(req, res),
);
productsRoutes.delete(
  '/:id',
  requirePermission('catalog.write', 'admin.full'),
  (req, res) => remove.handle(req, res),
);

// Regra tributária do produto — caminho aninhado para deixar claro o vínculo
// e habilitar permissões dedicadas (`tax-rule.write`) sem se misturar com cadastros básicos.
productsRoutes.post(
  '/:id/tax-rules',
  requirePermission('tax-rule.write', 'catalog.write', 'admin.full'),
  validate({ body: productTaxRuleSchema }),
  (req, res) => addRule.handle(req, res),
);

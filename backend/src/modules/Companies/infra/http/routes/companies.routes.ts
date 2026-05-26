import { Router } from 'express';

import { CreateCompanyController } from '@modules/Companies/useCases/CreateCompany/CreateCompanyController';
import { ListCompaniesController } from '@modules/Companies/useCases/ListCompanies/ListCompaniesController';
import { UpdateCompanyController } from '@modules/Companies/useCases/UpdateCompany/UpdateCompanyController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  createCompanySchema,
  updateCompanySchema,
} from '../validators/companyValidators';

export const companiesRoutes = Router();

const create = new CreateCompanyController();
const list = new ListCompaniesController();
const update = new UpdateCompanyController();

companiesRoutes.use(requireAuth);

companiesRoutes.get('/', (req, res) => list.handle(req, res));
companiesRoutes.post(
  '/',
  requirePermission('company.create', 'admin.full'),
  validate({ body: createCompanySchema }),
  (req, res) => create.handle(req, res),
);
companiesRoutes.put(
  '/:id',
  requirePermission('company.create', 'admin.full'),
  validate({ body: updateCompanySchema }),
  (req, res) => update.handle(req, res),
);

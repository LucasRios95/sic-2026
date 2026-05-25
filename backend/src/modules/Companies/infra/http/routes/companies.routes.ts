import { Router } from 'express';

import { CreateCompanyController } from '@modules/Companies/useCases/CreateCompany/CreateCompanyController';
import { ListCompaniesController } from '@modules/Companies/useCases/ListCompanies/ListCompaniesController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { validate } from '@shared/infra/http/middlewares/validate';

import { createCompanySchema } from '../validators/companyValidators';

export const companiesRoutes = Router();

const create = new CreateCompanyController();
const list = new ListCompaniesController();

companiesRoutes.use(requireAuth);

companiesRoutes.get('/', (req, res) => list.handle(req, res));
companiesRoutes.post(
  '/',
  requirePermission('company.create', 'admin.full'),
  validate({ body: createCompanySchema }),
  (req, res) => create.handle(req, res),
);

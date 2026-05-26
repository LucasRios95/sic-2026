import { Router } from 'express';

import { ListBeneficiosController } from '@modules/TaxEngine/useCases/ListBeneficios/ListBeneficiosController';
import { ListIcmsStMvaController } from '@modules/TaxEngine/useCases/ListIcmsStMva/ListIcmsStMvaController';
import { ListInterstateAliquotsController } from '@modules/TaxEngine/useCases/ListInterstateAliquots/ListInterstateAliquotsController';
import { ListTaxParametersController } from '@modules/TaxEngine/useCases/ListTaxParameters/ListTaxParametersController';
import { SimulateTaxController } from '@modules/TaxEngine/useCases/SimulateTax/SimulateTaxController';
import { UpsertTaxParameterController } from '@modules/TaxEngine/useCases/UpsertTaxParameter/UpsertTaxParameterController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  listTaxParametersQuerySchema,
  upsertTaxParameterSchema,
} from '../validators/taxParamsValidators';
import { simulateTaxSchema } from '../validators/taxValidators';

export const taxRoutes = Router();

const simulate = new SimulateTaxController();
const listParams = new ListTaxParametersController();
const upsertParam = new UpsertTaxParameterController();
const listInterstate = new ListInterstateAliquotsController();
const listIcmsSt = new ListIcmsStMvaController();
const listBeneficios = new ListBeneficiosController();

// requireAuth global, tenantContext condicional por rota (algumas operações são globais).
taxRoutes.use(requireAuth);

/**
 * Simulação de cálculo tributário SEM persistência. Endpoint usado pelo frontend
 * para pré-visualizar a tributação enquanto o faturista compõe a NF-e.
 */
taxRoutes.post(
  '/simulate',
  tenantContext({ required: true }),
  requirePermission('catalog.read', 'nfe.emit', 'admin.full'),
  validate({ body: simulateTaxSchema }),
  (req, res) => simulate.handle(req, res),
);

// --- Parâmetros tributários (IBS/CBS/PIS-COFINS via tax_parameters) ---
taxRoutes.get(
  '/parameters',
  tenantContext({ required: false }),
  requirePermission('tax.parameter.read', 'tax.parameter.write', 'admin.full'),
  validate({ query: listTaxParametersQuerySchema }),
  (req, res) => listParams.handle(req, res),
);
taxRoutes.post(
  '/parameters',
  tenantContext({ required: false }),
  requirePermission('tax.parameter.write', 'admin.full'),
  validate({ body: upsertTaxParameterSchema }),
  (req, res) => upsertParam.handle(req, res),
);

// --- Tabelas globais (read-only nesta versão; edição inicial via seed/SQL) ---
taxRoutes.get(
  '/interstate-aliquots',
  requirePermission('tax.parameter.read', 'tax.parameter.write', 'admin.full'),
  (req, res) => listInterstate.handle(req, res),
);
taxRoutes.get(
  '/icms-st-mva',
  requirePermission('tax.parameter.read', 'tax.parameter.write', 'admin.full'),
  (req, res) => listIcmsSt.handle(req, res),
);
taxRoutes.get(
  '/beneficios-fiscais',
  requirePermission('tax.parameter.read', 'tax.parameter.write', 'admin.full'),
  (req, res) => listBeneficios.handle(req, res),
);

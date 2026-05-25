import { Router } from 'express';

import { SimulateTaxController } from '@modules/TaxEngine/useCases/SimulateTax/SimulateTaxController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import { simulateTaxSchema } from '../validators/taxValidators';

export const taxRoutes = Router();

const simulate = new SimulateTaxController();

taxRoutes.use(requireAuth, tenantContext({ required: true }));

/**
 * Simulação de cálculo tributário SEM persistência. Endpoint usado pelo frontend
 * para pré-visualizar a tributação enquanto o faturista compõe a NF-e.
 *
 * Permissão pragmática: catalog.read OU nfe.emit (quem emite precisa simular antes).
 */
taxRoutes.post(
  '/simulate',
  requirePermission('catalog.read', 'nfe.emit', 'admin.full'),
  validate({ body: simulateTaxSchema }),
  (req, res) => simulate.handle(req, res),
);

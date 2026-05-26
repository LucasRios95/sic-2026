import { Router } from 'express';

import { LookupCepController } from '@modules/Lookup/useCases/LookupCep/LookupCepController';
import { LookupCnpjController } from '@modules/Lookup/useCases/LookupCnpj/LookupCnpjController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';

export const lookupRoutes = Router();

const cepController = new LookupCepController();
const cnpjController = new LookupCnpjController();

// Lookups são leitura pública contra fontes externas (ViaCEP + BrasilAPI). Exigem
// autenticação só para evitar abuso fora do tenant — não dependem de permissão fiscal
// específica.
lookupRoutes.use(requireAuth);

lookupRoutes.get('/cep/:cep', (req, res) => cepController.handle(req, res));
lookupRoutes.get('/cnpj/:cnpj', (req, res) => cnpjController.handle(req, res));

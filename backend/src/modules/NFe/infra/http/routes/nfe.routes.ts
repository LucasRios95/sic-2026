import { Router } from 'express';

import { CancelarNFeController } from '@modules/NFe/useCases/CancelarNFe/CancelarNFeController';
import { EmitirCceController } from '@modules/NFe/useCases/EmitirCce/EmitirCceController';
import { EmitirEpecController } from '@modules/NFe/useCases/EmitirEpec/EmitirEpecController';
import { EmitirNFeController } from '@modules/NFe/useCases/EmitirNFe/EmitirNFeController';
import { GenerateDanfeController } from '@modules/NFe/useCases/GenerateDanfe/GenerateDanfeController';
import { GetNFeController } from '@modules/NFe/useCases/GetNFe/GetNFeController';
import { GetProximoNumeroController } from '@modules/NFe/useCases/GetProximoNumero/GetProximoNumeroController';
import { InutilizarNumeracaoController } from '@modules/NFe/useCases/InutilizarNumeracao/InutilizarNumeracaoController';
import { ListNFesController } from '@modules/NFe/useCases/ListNFes/ListNFesController';
import { SendNFeByEmailController } from '@modules/NFe/useCases/SendNFeByEmail/SendNFeByEmailController';
import { StatusServicoController } from '@modules/NFe/useCases/StatusServico/StatusServicoController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  cancelarNFeSchema,
  emitirCceSchema,
  emitirEpecSchema,
  emitirNFeSchema,
  inutilizarNumeracaoSchema,
  listNFesQuerySchema,
} from '../validators/emitirNFeValidators';
import { statusServicoSchema } from '../validators/nfeValidators';

export const nfeRoutes = Router();

const statusServicoController = new StatusServicoController();
const emitirController = new EmitirNFeController();
const cancelarController = new CancelarNFeController();
const cceController = new EmitirCceController();
const epecController = new EmitirEpecController();
const inutilizarController = new InutilizarNumeracaoController();
const getController = new GetNFeController();
const proximoNumeroController = new GetProximoNumeroController();
const listController = new ListNFesController();
const danfeController = new GenerateDanfeController();
const sendEmailController = new SendNFeByEmailController();

nfeRoutes.use(requireAuth, tenantContext({ required: true }));

// --- Smoke test SEFAZ ---
nfeRoutes.post(
  '/status-servico',
  requirePermission('nfe.emit', 'admin.full'),
  validate({ body: statusServicoSchema }),
  (req, res) => statusServicoController.handle(req, res),
);

// --- Listagem e consulta ---
nfeRoutes.get(
  '/',
  requirePermission('nfe.read', 'nfe.emit', 'admin.full'),
  validate({ query: listNFesQuerySchema }),
  (req, res) => listController.handle(req, res),
);
// Peek do proximo numero da serie (sem reservar) — usado pela UI pra mostrar
// e pre-popular o campo "Numero" no form de emissao.
nfeRoutes.get(
  '/proximo-numero',
  requirePermission('nfe.emit', 'nfe.read', 'admin.full'),
  (req, res) => proximoNumeroController.handle(req, res),
);
nfeRoutes.get(
  '/:id',
  requirePermission('nfe.read', 'nfe.emit', 'admin.full'),
  (req, res) => getController.handle(req, res),
);

// --- Emissão e ciclo de vida ---
nfeRoutes.post(
  '/',
  requirePermission('nfe.emit', 'admin.full'),
  validate({ body: emitirNFeSchema }),
  (req, res) => emitirController.handle(req, res),
);
nfeRoutes.post(
  '/:id/cancel',
  requirePermission('nfe.cancel', 'admin.full'),
  validate({ body: cancelarNFeSchema }),
  (req, res) => cancelarController.handle(req, res),
);
nfeRoutes.post(
  '/:id/cce',
  requirePermission('nfe.cce', 'admin.full'),
  validate({ body: emitirCceSchema }),
  (req, res) => cceController.handle(req, res),
);

// Contingência EPEC — só deve ser usada quando SEFAZ normal E SVC estão DOWN. O
// use case verifica essa pré-condição lendo o monitor de saúde (EP-06c).
nfeRoutes.post(
  '/:id/epec',
  requirePermission('nfe.contingencia.epec', 'admin.full'),
  validate({ body: emitirEpecSchema }),
  (req, res) => epecController.handle(req, res),
);

// Inutilização não é sob :id (não há NFe, é faixa virgem). Rota separada.
nfeRoutes.post(
  '/inutilizar',
  requirePermission('nfe.cancel', 'admin.full'),
  validate({ body: inutilizarNumeracaoSchema }),
  (req, res) => inutilizarController.handle(req, res),
);

// --- DANFE + envio por e-mail (EP-08) ---
// Gera (ou regenera) o DANFE PDF e devolve URL assinada com TTL 15 min.
nfeRoutes.post(
  '/:id/danfe',
  requirePermission('nfe.read', 'nfe.emit', 'admin.full'),
  (req, res) => danfeController.handle(req, res),
);
// Envia XML + DANFE por e-mail (default = email do cliente; override via body.to).
nfeRoutes.post(
  '/:id/email',
  requirePermission('nfe.emit', 'admin.full'),
  (req, res) => sendEmailController.handle(req, res),
);

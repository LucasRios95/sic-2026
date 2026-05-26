import { Router } from 'express';

import { GetReceivedDocumentController } from '@modules/NFeRecepcao/useCases/GetReceivedDocument/GetReceivedDocumentController';
import { ListReceivedDocumentsController } from '@modules/NFeRecepcao/useCases/ListReceivedDocuments/ListReceivedDocumentsController';
import { ManifestarDestinatarioController } from '@modules/NFeRecepcao/useCases/ManifestarDestinatario/ManifestarDestinatarioController';
import { SincronizarRecebidosController } from '@modules/NFeRecepcao/useCases/SincronizarRecebidos/SincronizarRecebidosController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  listReceivedDocumentsQuerySchema,
  manifestarSchema,
  sincronizarRecebidosSchema,
} from '../validators/recepcaoValidators';

export const recepcaoRoutes = Router();

const listController = new ListReceivedDocumentsController();
const getController = new GetReceivedDocumentController();
const sincController = new SincronizarRecebidosController();
const manifestController = new ManifestarDestinatarioController();

recepcaoRoutes.use(requireAuth, tenantContext({ required: true }));

// Inbox de notas recebidas — qualquer usuário com permissão de leitura fiscal pode ver.
recepcaoRoutes.get(
  '/',
  requirePermission('nfe.read', 'entrada.manifest', 'admin.full'),
  validate({ query: listReceivedDocumentsQuerySchema }),
  (req, res) => listController.handle(req, res),
);

// Detalhe de um documento recebido (cabeçalho + histórico de manifestações).
recepcaoRoutes.get(
  '/:id',
  requirePermission('nfe.read', 'entrada.manifest', 'admin.full'),
  (req, res) => getController.handle(req, res),
);

// Forçar sincronização manual (sob demanda) — útil quando o worker está parado em dev
// ou quando o operador quer reconsultar imediatamente.
recepcaoRoutes.post(
  '/sync',
  requirePermission('entrada.manifest', 'admin.full'),
  validate({ body: sincronizarRecebidosSchema }),
  (req, res) => sincController.handle(req, res),
);

// Manifestar (ciência, confirmação, desconhecimento, operação não realizada).
recepcaoRoutes.post(
  '/:id/manifest',
  requirePermission('entrada.manifest', 'admin.full'),
  validate({ body: manifestarSchema }),
  (req, res) => manifestController.handle(req, res),
);

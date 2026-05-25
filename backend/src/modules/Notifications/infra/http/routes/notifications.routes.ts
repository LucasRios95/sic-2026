import { Router } from 'express';

import { ListNotificationsController } from '@modules/Notifications/useCases/ListNotifications/ListNotificationsController';
import { MarkAllAsReadController } from '@modules/Notifications/useCases/MarkAllAsRead/MarkAllAsReadController';
import { MarkNotificationAsReadController } from '@modules/Notifications/useCases/MarkNotificationAsRead/MarkNotificationAsReadController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import { listNotificationsQuerySchema } from '../validators/notificationValidators';

export const notificationsRoutes = Router();

const list = new ListNotificationsController();
const markOne = new MarkNotificationAsReadController();
const markAll = new MarkAllAsReadController();

// Notificações são pessoais — apenas auth + tenantContext bastam. Não há permissão
// específica porque qualquer usuário lê a própria inbox.
notificationsRoutes.use(requireAuth, tenantContext({ required: true }));

notificationsRoutes.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  (req, res) => list.handle(req, res),
);
notificationsRoutes.patch('/read-all', (req, res) => markAll.handle(req, res));
notificationsRoutes.patch('/:id/read', (req, res) => markOne.handle(req, res));

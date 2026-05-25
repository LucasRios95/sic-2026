import { Router } from 'express';

import { CreateUserController } from '@modules/Users/useCases/CreateUser/CreateUserController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { validate } from '@shared/infra/http/middlewares/validate';

import { createUserSchema } from '../validators/userValidators';

export const usersRoutes = Router();

const create = new CreateUserController();

usersRoutes.use(requireAuth);

usersRoutes.post(
  '/',
  requirePermission('user.create', 'admin.full'),
  validate({ body: createUserSchema }),
  (req, res) => create.handle(req, res),
);

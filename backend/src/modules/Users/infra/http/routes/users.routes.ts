import { Router } from 'express';

import { AssignUserRoleController } from '@modules/AccessControl/useCases/AssignUserRole/AssignUserRoleController';
import { ListRolesController } from '@modules/AccessControl/useCases/ListRoles/ListRolesController';
import { ListUserRolesController } from '@modules/AccessControl/useCases/ListUserRoles/ListUserRolesController';
import { RevokeUserRoleController } from '@modules/AccessControl/useCases/RevokeUserRole/RevokeUserRoleController';
import { CreateUserController } from '@modules/Users/useCases/CreateUser/CreateUserController';
import { ListUsersController } from '@modules/Users/useCases/ListUsers/ListUsersController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { validate } from '@shared/infra/http/middlewares/validate';

import { createUserSchema, userRoleSchema } from '../validators/userValidators';

export const usersRoutes = Router();

const create = new CreateUserController();
const list = new ListUsersController();
const listRoles = new ListRolesController();
const listUserRoles = new ListUserRolesController();
const assignRole = new AssignUserRoleController();
const revokeRole = new RevokeUserRoleController();

usersRoutes.use(requireAuth);

// Leitura: usuários e papéis do tenant.
usersRoutes.get('/', requirePermission('user.read', 'admin.full'), (req, res) =>
  list.handle(req, res),
);
usersRoutes.get('/roles', requirePermission('user.read', 'admin.full'), (req, res) =>
  listRoles.handle(req, res),
);
usersRoutes.get('/:userId/roles', requirePermission('user.read', 'admin.full'), (req, res) =>
  listUserRoles.handle(req, res),
);

// Criação de usuário.
usersRoutes.post(
  '/',
  requirePermission('user.create', 'admin.full'),
  validate({ body: createUserSchema }),
  (req, res) => create.handle(req, res),
);

// Gestão de acesso por empresa (papel × empresa).
usersRoutes.post(
  '/:userId/roles',
  requirePermission('user.role.assign', 'admin.full'),
  validate({ body: userRoleSchema }),
  (req, res) => assignRole.handle(req, res),
);
usersRoutes.delete(
  '/:userId/roles',
  requirePermission('user.role.assign', 'admin.full'),
  validate({ body: userRoleSchema }),
  (req, res) => revokeRole.handle(req, res),
);

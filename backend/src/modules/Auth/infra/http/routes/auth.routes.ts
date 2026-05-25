import { Router } from 'express';

import { AuthenticateUserController } from '@modules/Auth/useCases/AuthenticateUser/AuthenticateUserController';
import { LogoutUserController } from '@modules/Auth/useCases/LogoutUser/LogoutUserController';
import { MeController } from '@modules/Auth/useCases/Me/MeController';
import { RefreshTokenController } from '@modules/Auth/useCases/RefreshToken/RefreshTokenController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { validate } from '@shared/infra/http/middlewares/validate';

import {
  authenticateUserSchema,
  logoutSchema,
  refreshTokenSchema,
} from '../validators/authValidators';

export const authRoutes = Router();

const authenticate = new AuthenticateUserController();
const refresh = new RefreshTokenController();
const logout = new LogoutUserController();
const me = new MeController();

authRoutes.post('/login', validate({ body: authenticateUserSchema }), (req, res) =>
  authenticate.handle(req, res),
);
authRoutes.post('/refresh', validate({ body: refreshTokenSchema }), (req, res) =>
  refresh.handle(req, res),
);
authRoutes.post('/logout', validate({ body: logoutSchema }), (req, res) => logout.handle(req, res));
authRoutes.get('/me', requireAuth, (req, res) => me.handle(req, res));

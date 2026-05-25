import { NextFunction, Request, Response } from 'express';
import { container } from 'tsyringe';

import { IUserRoleRepository } from '@modules/AccessControl/repositories/IUserRoleRepository';
import { IUserRepository } from '@modules/Users/repositories/IUserRepository';
import { updateRequestContext } from '@shared/context/request-context';
import { ITokenProvider } from '@shared/container/providers/TokenProvider/ITokenProvider';
import { UnauthorizedError } from '@shared/errors';

/**
 * Verifica o JWT, carrega o usuário e enriquece o contexto (AsyncLocalStorage + req.user).
 * Resolve usuário e permissões a cada requisição: garante que revogações ou alterações
 * de papéis surtam efeito sem esperar o token expirar.
 */
export async function requireAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    throw new UnauthorizedError('Token não fornecido');
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedError('Formato de Authorization inválido');
  }

  const tokenProvider = container.resolve<ITokenProvider>('TokenProvider');
  const userRepository = container.resolve<IUserRepository>('UserRepository');
  const userRoleRepository = container.resolve<IUserRoleRepository>('UserRoleRepository');

  const payload = tokenProvider.verifyAccessToken(token);
  const user = await userRepository.findById(payload.sub);
  if (!user || !user.active) {
    throw new UnauthorizedError('Usuário inativo ou inexistente');
  }

  const context = await userRoleRepository.loadContextForUser(user.id);

  request.user = {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    accessibleCompanyIds: context.accessibleCompanyIds,
    permissions: context.permissions,
    roles: context.roles,
  };

  updateRequestContext({
    userId: user.id,
    tenantId: user.tenantId,
    permissions: context.permissions,
    roles: context.roles,
    accessibleCompanyIds: context.accessibleCompanyIds,
  });

  next();
}

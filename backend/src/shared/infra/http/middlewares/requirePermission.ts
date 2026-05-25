import { NextFunction, Request, Response } from 'express';

import { ForbiddenError } from '@shared/errors';

/**
 * Exige que o usuário autenticado tenha pelo menos uma das permissões informadas.
 * Quando nenhum código for passado, o middleware atua só como gate de "estar logado"
 * (uso raro; prefira requireAuth para isso).
 */
export function requirePermission(...permissions: string[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const userPerms = request.user?.permissions ?? [];

    if (permissions.length === 0) {
      next();
      return;
    }

    const allowed = permissions.some((code) => userPerms.includes(code));
    if (!allowed) {
      throw new ForbiddenError(
        `Você não tem permissão para esta operação (requer: ${permissions.join(' OU ')})`,
      );
    }
    next();
  };
}

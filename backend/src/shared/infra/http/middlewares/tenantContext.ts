import { NextFunction, Request, Response } from 'express';

import { GLOBAL_COMPANY_ID } from '@modules/AccessControl/infra/typeorm/entities/UserRole';
import { updateRequestContext } from '@shared/context/request-context';
import { ForbiddenError, ValidationError } from '@shared/errors';

/**
 * Resolve a empresa-alvo da requisição (header `X-Company-Id` ou query `?companyId=`).
 * Bloqueia o acesso a empresas fora do escopo do usuário e popula req.companyId.
 *
 * Modo `required`: rotas transacionais (faturamento, financeiro) exigem companyId.
 * Modo opcional: rotas administrativas (listar empresas, dados do usuário) podem operar
 * no nível do tenant inteiro.
 */
export function tenantContext(options: { required?: boolean } = {}) {
  const required = options.required ?? true;

  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.user) {
      throw new ForbiddenError('Contexto de empresa requer autenticação');
    }

    const headerCompanyId =
      (request.header('x-company-id') ?? (request.query.companyId as string | undefined)) || null;

    if (!headerCompanyId) {
      if (required) {
        throw new ValidationError(
          'Empresa não informada. Envie o header X-Company-Id ou o parâmetro companyId.',
        );
      }
      next();
      return;
    }

    const accessible = request.user.accessibleCompanyIds;
    const hasGlobal = accessible.includes(GLOBAL_COMPANY_ID);
    if (!hasGlobal && !accessible.includes(headerCompanyId)) {
      throw new ForbiddenError('Você não tem acesso a esta empresa');
    }

    request.companyId = headerCompanyId;
    updateRequestContext({ companyId: headerCompanyId });
    next();
  };
}

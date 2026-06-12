import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { RevokeUserRoleUseCase } from './RevokeUserRoleUseCase';

export class RevokeUserRoleController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(RevokeUserRoleUseCase);
    await useCase.execute({
      tenantId: request.user!.tenantId,
      userId: String(request.params.userId),
      roleId: request.body.roleId,
      companyId: request.body.companyId ?? null,
    });
    return response.status(204).send();
  }
}

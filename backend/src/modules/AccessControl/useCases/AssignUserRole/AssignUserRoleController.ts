import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { AssignUserRoleUseCase } from './AssignUserRoleUseCase';

export class AssignUserRoleController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(AssignUserRoleUseCase);
    await useCase.execute({
      tenantId: request.user!.tenantId,
      userId: String(request.params.userId),
      roleId: request.body.roleId,
      companyId: request.body.companyId ?? null,
    });
    return response.status(204).send();
  }
}

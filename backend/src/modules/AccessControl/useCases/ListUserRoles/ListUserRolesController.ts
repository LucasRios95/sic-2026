import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListUserRolesUseCase } from './ListUserRolesUseCase';

export class ListUserRolesController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListUserRolesUseCase);
    const data = await useCase.execute(request.user!.tenantId, String(request.params.userId));
    return response.json({ data });
  }
}

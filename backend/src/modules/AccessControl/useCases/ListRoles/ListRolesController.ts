import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListRolesUseCase } from './ListRolesUseCase';

export class ListRolesController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListRolesUseCase);
    const roles = await useCase.execute(request.user!.tenantId);
    const data = roles.map((r) => ({ id: r.id, name: r.name, description: r.description ?? null }));
    return response.json({ data });
  }
}

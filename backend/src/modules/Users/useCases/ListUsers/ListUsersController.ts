import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListUsersUseCase } from './ListUsersUseCase';

export class ListUsersController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListUsersUseCase);
    const users = await useCase.execute(request.user!.tenantId);
    // Nunca expõe hash de senha nem segredo MFA.
    const data = users.map(({ passwordHash: _ph, mfaSecret: _ms, ...safe }) => safe);
    return response.json({ data });
  }
}

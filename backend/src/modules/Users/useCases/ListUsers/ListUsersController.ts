import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListUsersUseCase } from './ListUsersUseCase';

export class ListUsersController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListUsersUseCase);
    const users = await useCase.execute(request.user!.tenantId);
    // DTO explícito: só o que a UI precisa. Nunca expõe hash de senha, segredo MFA
    // nem campos internos (tenantId, failedLogins, lockedUntil…). `isActive` é o
    // contrato com o front (entidade usa `active`).
    const data = users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      isActive: u.active,
    }));
    return response.json({ data });
  }
}

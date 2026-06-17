import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CreateUserUseCase } from './CreateUserUseCase';

export class CreateUserController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(CreateUserUseCase);
    const tenantId = request.user!.tenantId;

    const user = await useCase.execute({ ...request.body, tenantId });
    // Mesmo DTO do ListUsers — `isActive` é o contrato com o front (entidade usa `active`).
    return response.status(201).json({
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isActive: user.active,
      },
    });
  }
}

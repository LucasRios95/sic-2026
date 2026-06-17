import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UpdateUserUseCase } from './UpdateUserUseCase';

export class UpdateUserController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UpdateUserUseCase);
    const { fullName, active, password } = request.body as {
      fullName?: string;
      active?: boolean;
      password?: string;
    };

    const user = await useCase.execute({
      userId: String(request.params.userId),
      tenantId: request.user!.tenantId,
      fullName,
      active,
      password,
    });

    // Mesmo DTO do ListUsers/CreateUser — `isActive` é o contrato com o front.
    return response.json({
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isActive: user.active,
      },
    });
  }
}

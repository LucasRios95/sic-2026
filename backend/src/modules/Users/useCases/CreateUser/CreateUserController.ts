import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CreateUserUseCase } from './CreateUserUseCase';

export class CreateUserController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(CreateUserUseCase);
    const tenantId = request.user!.tenantId;

    const user = await useCase.execute({ ...request.body, tenantId });
    const { passwordHash: _ph, mfaSecret: _ms, ...safe } = user;
    return response.status(201).json({ data: safe });
  }
}

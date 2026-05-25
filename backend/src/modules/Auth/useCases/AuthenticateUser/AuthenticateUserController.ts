import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { AuthenticateUserUseCase } from './AuthenticateUserUseCase';

export class AuthenticateUserController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(AuthenticateUserUseCase);

    const result = await useCase.execute({
      email: request.body.email,
      password: request.body.password,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    });

    return response.json({ data: result });
  }
}

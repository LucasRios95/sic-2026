import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { LogoutUserUseCase } from './LogoutUserUseCase';

export class LogoutUserController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(LogoutUserUseCase);
    await useCase.execute({ refreshToken: request.body.refreshToken });
    return response.status(204).send();
  }
}

import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ChangePasswordUseCase } from './ChangePasswordUseCase';

export class ChangePasswordController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ChangePasswordUseCase);
    const { currentPassword, newPassword } = request.body as {
      currentPassword: string;
      newPassword: string;
    };

    await useCase.execute({
      userId: request.user!.id,
      currentPassword,
      newPassword,
    });

    return response.status(204).send();
  }
}

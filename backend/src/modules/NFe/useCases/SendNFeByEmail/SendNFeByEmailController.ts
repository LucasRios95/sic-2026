import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { SendNFeByEmailUseCase } from './SendNFeByEmailUseCase';

export class SendNFeByEmailController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(SendNFeByEmailUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      userId: request.user!.id,
      nfeId: request.params.id,
      to: request.body?.to,
    });
    return response.status(202).json({ data: result });
  }
}

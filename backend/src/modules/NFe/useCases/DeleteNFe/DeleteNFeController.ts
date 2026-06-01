import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { DeleteNFeUseCase } from './DeleteNFeUseCase';

export class DeleteNFeController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(DeleteNFeUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      userId: request.user!.id,
      nfeId: request.params.id,
    });
    return response.json({ data: result });
  }
}

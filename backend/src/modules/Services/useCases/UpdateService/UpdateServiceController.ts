import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UpdateServiceUseCase } from './UpdateServiceUseCase';

export class UpdateServiceController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UpdateServiceUseCase);
    const service = await useCase.execute({
      companyId: request.companyId!,
      serviceId: request.params.id,
      data: request.body,
    });
    return response.json({ data: service });
  }
}

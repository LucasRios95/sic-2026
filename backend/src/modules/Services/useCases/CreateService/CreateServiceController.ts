import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CreateServiceUseCase } from './CreateServiceUseCase';

export class CreateServiceController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(CreateServiceUseCase);
    const service = await useCase.execute({ ...request.body, companyId: request.companyId! });
    return response.status(201).json({ data: service });
  }
}

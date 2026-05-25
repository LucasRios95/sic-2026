import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CreateProductUseCase } from './CreateProductUseCase';

export class CreateProductController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(CreateProductUseCase);
    const product = await useCase.execute({ ...request.body, companyId: request.companyId! });
    return response.status(201).json({ data: product });
  }
}

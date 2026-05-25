import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UpdateProductUseCase } from './UpdateProductUseCase';

export class UpdateProductController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UpdateProductUseCase);
    const product = await useCase.execute({
      companyId: request.companyId!,
      productId: request.params.id,
      data: request.body,
    });
    return response.json({ data: product });
  }
}

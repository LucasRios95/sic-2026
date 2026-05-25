import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { DeleteProductUseCase } from './DeleteProductUseCase';

export class DeleteProductController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(DeleteProductUseCase);
    await useCase.execute(request.companyId!, request.params.id);
    return response.status(204).send();
  }
}

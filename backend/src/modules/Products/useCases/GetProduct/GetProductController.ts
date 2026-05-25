import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GetProductUseCase } from './GetProductUseCase';

export class GetProductController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GetProductUseCase);
    const result = await useCase.execute(request.companyId!, request.params.id);
    return response.json({ data: result });
  }
}

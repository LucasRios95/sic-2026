import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { SimulateTaxUseCase } from './SimulateTaxUseCase';

export class SimulateTaxController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(SimulateTaxUseCase);
    const result = await useCase.execute({
      ...request.body,
      companyId: request.companyId!,
    });
    return response.json({ data: result });
  }
}

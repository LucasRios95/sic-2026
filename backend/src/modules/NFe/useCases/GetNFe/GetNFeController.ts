import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GetNFeUseCase } from './GetNFeUseCase';

export class GetNFeController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GetNFeUseCase);
    const result = await useCase.execute(request.companyId!, request.params.id);
    return response.json({ data: result });
  }
}

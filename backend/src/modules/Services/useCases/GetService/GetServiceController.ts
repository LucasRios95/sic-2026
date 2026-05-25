import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GetServiceUseCase } from './GetServiceUseCase';

export class GetServiceController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GetServiceUseCase);
    const result = await useCase.execute(request.companyId!, request.params.id);
    return response.json({ data: result });
  }
}

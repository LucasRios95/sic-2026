import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { LookupCnpjUseCase } from './LookupCnpjUseCase';

export class LookupCnpjController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(LookupCnpjUseCase);
    const result = await useCase.execute(request.params.cnpj);
    return response.json({ data: result });
  }
}

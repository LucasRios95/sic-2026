import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { LookupCepUseCase } from './LookupCepUseCase';

export class LookupCepController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(LookupCepUseCase);
    const result = await useCase.execute(request.params.cep);
    return response.json({ data: result });
  }
}

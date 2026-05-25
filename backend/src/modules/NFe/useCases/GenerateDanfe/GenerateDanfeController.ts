import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GenerateDanfeUseCase } from './GenerateDanfeUseCase';

export class GenerateDanfeController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GenerateDanfeUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      nfeId: request.params.id,
      force: request.body?.force === true,
    });
    return response.json({ data: result });
  }
}

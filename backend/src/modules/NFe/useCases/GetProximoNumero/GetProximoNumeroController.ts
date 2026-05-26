import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GetProximoNumeroUseCase } from './GetProximoNumeroUseCase';

export class GetProximoNumeroController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GetProximoNumeroUseCase);
    const serie = Number(request.query.serie ?? 1);
    const modelo = (request.query.modelo as string | undefined) ?? '55';
    const result = await useCase.execute({
      companyId: request.companyId!,
      modelo,
      serie,
    });
    return response.json({ data: result });
  }
}

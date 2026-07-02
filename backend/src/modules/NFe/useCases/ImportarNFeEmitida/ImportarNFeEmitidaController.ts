import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ImportarNFeEmitidaUseCase } from './ImportarNFeEmitidaUseCase';

export class ImportarNFeEmitidaController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ImportarNFeEmitidaUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      userId: request.user!.id,
      arquivos: request.body.arquivos,
    });
    return response.status(201).json({ data: result });
  }
}

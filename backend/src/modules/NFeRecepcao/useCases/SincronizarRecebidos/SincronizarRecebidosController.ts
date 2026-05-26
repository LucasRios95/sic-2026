import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { SincronizarRecebidosUseCase } from './SincronizarRecebidosUseCase';

export class SincronizarRecebidosController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(SincronizarRecebidosUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      certificateVaultRef: request.body.certificateVaultRef,
      maxIterations: request.body.maxIterations,
    });
    return response.json({ data: result });
  }
}

import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CancelarNFeUseCase } from './CancelarNFeUseCase';

export class CancelarNFeController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(CancelarNFeUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      userId: request.user!.id,
      nfeId: request.params.id,
      justificativa: request.body.justificativa,
      certificateVaultRef: request.body.certificateVaultRef,
    });
    return response.json({ data: result });
  }
}

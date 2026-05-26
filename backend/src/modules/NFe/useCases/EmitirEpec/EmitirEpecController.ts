import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { EmitirEpecUseCase } from './EmitirEpecUseCase';

export class EmitirEpecController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(EmitirEpecUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      nfeId: request.params.id,
      certificateVaultRef: request.body.certificateVaultRef,
      userId: request.user!.id,
    });
    return response.status(201).json({ data: result });
  }
}

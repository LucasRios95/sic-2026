import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { EmitirCceUseCase } from './EmitirCceUseCase';

export class EmitirCceController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(EmitirCceUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      nfeId: request.params.id,
      userId: request.user!.id,
      correcao: request.body.correcao,
      certificateVaultRef: request.body.certificateVaultRef,
    });
    return response.status(201).json({ data: result });
  }
}

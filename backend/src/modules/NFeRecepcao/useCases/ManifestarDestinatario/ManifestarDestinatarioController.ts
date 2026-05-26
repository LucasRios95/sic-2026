import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ManifestarDestinatarioUseCase } from './ManifestarDestinatarioUseCase';

export class ManifestarDestinatarioController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ManifestarDestinatarioUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      receivedDocumentId: request.params.id,
      userId: request.user!.id,
      tipo: request.body.tipo,
      justificativa: request.body.justificativa,
      certificateVaultRef: request.body.certificateVaultRef,
    });
    return response.status(201).json({ data: result });
  }
}

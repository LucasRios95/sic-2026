import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { StatusServicoUseCase } from './StatusServicoUseCase';

export class StatusServicoController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(StatusServicoUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      certificateVaultRef: request.body.certificateVaultRef,
      uf: request.body.uf,
      ambiente: request.body.ambiente,
      contingenciaSvc: request.body.contingenciaSvc,
    });
    return response.json({ data: result });
  }
}

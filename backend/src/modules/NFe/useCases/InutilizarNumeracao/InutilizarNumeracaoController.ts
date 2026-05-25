import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { InutilizarNumeracaoUseCase } from './InutilizarNumeracaoUseCase';

export class InutilizarNumeracaoController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(InutilizarNumeracaoUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      userId: request.user!.id,
      modelo: '55',
      serie: request.body.serie,
      numeroInicial: request.body.numeroInicial,
      numeroFinal: request.body.numeroFinal,
      justificativa: request.body.justificativa,
      ano: request.body.ano,
      certificateVaultRef: request.body.certificateVaultRef,
    });
    return response.status(201).json({ data: result });
  }
}

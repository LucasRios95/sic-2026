import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UpsertCfopUseCase } from './UpsertCfopUseCase';

export class UpsertCfopController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UpsertCfopUseCase);
    const result = await useCase.execute({
      codigo: request.body.codigo,
      descricao: request.body.descricao,
      grupo: request.body.grupo,
      geraCreditoPisCofins: request.body.geraCreditoPisCofins,
      ativo: request.body.ativo,
      observacoes: request.body.observacoes,
    });
    return response.status(201).json({ data: result });
  }
}

import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UpsertTaxParameterUseCase } from './UpsertTaxParameterUseCase';

export class UpsertTaxParameterController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UpsertTaxParameterUseCase);
    const body = request.body;

    const result = await useCase.execute({
      chave: body.chave,
      valor: body.valor,
      fonteNorma: body.fonteNorma,
      validFrom: new Date(body.validFrom),
      validTo: body.validTo ? new Date(body.validTo) : null,
      companyId: body.scope === 'company' ? request.companyId : null,
      userId: request.user?.id,
    });
    return response.status(201).json({ data: result });
  }
}

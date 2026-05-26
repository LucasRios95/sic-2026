import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListTaxParametersUseCase } from './ListTaxParametersUseCase';

export class ListTaxParametersController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListTaxParametersUseCase);

    const scope = (request.query.scope as string | undefined) ?? 'all';
    const companyId =
      scope === 'global' ? null : scope === 'company' ? request.companyId : undefined;

    const items = await useCase.execute({
      companyId,
      chavePrefix: request.query.chavePrefix as string | undefined,
    });
    return response.json({ data: items });
  }
}

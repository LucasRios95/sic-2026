import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ReplaceCurrentTaxRuleUseCase } from './ReplaceCurrentTaxRuleUseCase';

export class ReplaceCurrentTaxRuleController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ReplaceCurrentTaxRuleUseCase);
    const rule = await useCase.execute({
      companyId: request.companyId!,
      productId: request.params.id,
      data: request.body,
    });
    return response.status(200).json({ data: rule });
  }
}

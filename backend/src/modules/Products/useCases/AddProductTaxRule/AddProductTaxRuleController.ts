import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { AddProductTaxRuleUseCase } from './AddProductTaxRuleUseCase';

export class AddProductTaxRuleController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(AddProductTaxRuleUseCase);
    const rule = await useCase.execute({
      companyId: request.companyId!,
      productId: request.params.id,
      data: request.body,
    });
    return response.status(201).json({ data: rule });
  }
}

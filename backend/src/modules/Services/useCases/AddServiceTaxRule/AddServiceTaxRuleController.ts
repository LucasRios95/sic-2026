import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { AddServiceTaxRuleUseCase } from './AddServiceTaxRuleUseCase';

export class AddServiceTaxRuleController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(AddServiceTaxRuleUseCase);
    const rule = await useCase.execute({
      companyId: request.companyId!,
      serviceId: request.params.id,
      data: request.body,
    });
    return response.status(201).json({ data: rule });
  }
}

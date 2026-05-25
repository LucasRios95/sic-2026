import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UpdateCustomerUseCase } from './UpdateCustomerUseCase';

export class UpdateCustomerController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UpdateCustomerUseCase);
    const customer = await useCase.execute({
      companyId: request.companyId!,
      customerId: request.params.id,
      data: request.body,
    });
    return response.json({ data: customer });
  }
}

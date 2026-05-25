import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GetCustomerUseCase } from './GetCustomerUseCase';

export class GetCustomerController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GetCustomerUseCase);
    const customer = await useCase.execute(request.companyId!, request.params.id);
    return response.json({ data: customer });
  }
}

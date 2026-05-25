import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CreateCustomerUseCase } from './CreateCustomerUseCase';

export class CreateCustomerController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(CreateCustomerUseCase);
    const customer = await useCase.execute({ ...request.body, companyId: request.companyId! });
    return response.status(201).json({ data: customer });
  }
}

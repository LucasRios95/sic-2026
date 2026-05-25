import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CreateSupplierUseCase } from './CreateSupplierUseCase';

export class CreateSupplierController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(CreateSupplierUseCase);
    const supplier = await useCase.execute({ ...request.body, companyId: request.companyId! });
    return response.status(201).json({ data: supplier });
  }
}

import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UpdateSupplierUseCase } from './UpdateSupplierUseCase';

export class UpdateSupplierController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UpdateSupplierUseCase);
    const supplier = await useCase.execute({
      companyId: request.companyId!,
      supplierId: request.params.id,
      data: request.body,
    });
    return response.json({ data: supplier });
  }
}

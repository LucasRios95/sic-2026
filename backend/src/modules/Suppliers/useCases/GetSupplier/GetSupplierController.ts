import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GetSupplierUseCase } from './GetSupplierUseCase';

export class GetSupplierController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GetSupplierUseCase);
    const supplier = await useCase.execute(request.companyId!, request.params.id);
    return response.json({ data: supplier });
  }
}

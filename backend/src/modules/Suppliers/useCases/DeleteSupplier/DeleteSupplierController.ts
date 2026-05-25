import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { DeleteSupplierUseCase } from './DeleteSupplierUseCase';

export class DeleteSupplierController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(DeleteSupplierUseCase);
    await useCase.execute(request.companyId!, request.params.id);
    return response.status(204).send();
  }
}

import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { DeleteCustomerUseCase } from './DeleteCustomerUseCase';

export class DeleteCustomerController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(DeleteCustomerUseCase);
    await useCase.execute(request.companyId!, request.params.id);
    return response.status(204).send();
  }
}

import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { DeleteServiceUseCase } from './DeleteServiceUseCase';

export class DeleteServiceController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(DeleteServiceUseCase);
    await useCase.execute(request.companyId!, request.params.id);
    return response.status(204).send();
  }
}

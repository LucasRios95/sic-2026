import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { MarkNotificationAsReadUseCase } from './MarkNotificationAsReadUseCase';

export class MarkNotificationAsReadController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(MarkNotificationAsReadUseCase);
    await useCase.execute(request.params.id, request.companyId!, request.user!.id);
    return response.status(204).send();
  }
}

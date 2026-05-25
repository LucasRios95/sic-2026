import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { MarkAllAsReadUseCase } from './MarkAllAsReadUseCase';

export class MarkAllAsReadController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(MarkAllAsReadUseCase);
    const result = await useCase.execute(request.companyId!, request.user!.id);
    return response.json({ data: result });
  }
}

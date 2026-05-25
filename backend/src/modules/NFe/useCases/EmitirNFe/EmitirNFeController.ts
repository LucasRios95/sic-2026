import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { EmitirNFeUseCase } from './EmitirNFeUseCase';

export class EmitirNFeController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(EmitirNFeUseCase);
    const result = await useCase.execute({
      ...request.body,
      companyId: request.companyId!,
      userId: request.user!.id,
    });
    return response.status(result.alreadyEmitted ? 200 : 201).json({
      data: result.nfe,
      meta: { alreadyEmitted: result.alreadyEmitted },
    });
  }
}

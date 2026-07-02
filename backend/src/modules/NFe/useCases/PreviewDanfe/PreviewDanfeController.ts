import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { PreviewDanfeUseCase } from './PreviewDanfeUseCase';

export class PreviewDanfeController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(PreviewDanfeUseCase);
    const pdf = await useCase.execute({
      ...request.body,
      companyId: request.companyId!,
    });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'inline; filename="danfe-previa.pdf"');
    return response.send(pdf);
  }
}

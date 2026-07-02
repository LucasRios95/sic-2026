import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ExportXmlCompetenciaUseCase } from './ExportXmlCompetenciaUseCase';

export class ExportXmlCompetenciaController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ExportXmlCompetenciaUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      ano: Number(request.query.ano),
      mes: Number(request.query.mes),
    });

    response.setHeader('Content-Type', 'application/zip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    response.setHeader('X-Nfe-Total', String(result.total));
    return response.send(result.zip);
  }
}

import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ImportarXmlRecebidoUseCase } from './ImportarXmlRecebidoUseCase';

export class ImportarXmlRecebidoController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ImportarXmlRecebidoUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      arquivos: request.body.arquivos,
    });
    return response.json({ data: result });
  }
}

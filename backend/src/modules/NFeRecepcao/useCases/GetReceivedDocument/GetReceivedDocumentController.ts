import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GetReceivedDocumentUseCase } from './GetReceivedDocumentUseCase';

export class GetReceivedDocumentController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GetReceivedDocumentUseCase);
    const { document, manifestations } = await useCase.execute({
      companyId: request.companyId!,
      receivedDocumentId: request.params.id,
    });
    return response.json({ data: { document, manifestations } });
  }
}

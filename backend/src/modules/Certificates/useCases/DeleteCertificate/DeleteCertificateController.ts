import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { DeleteCertificateUseCase } from './DeleteCertificateUseCase';

export class DeleteCertificateController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(DeleteCertificateUseCase);
    await useCase.execute({
      companyId: request.companyId!,
      certificateId: String(request.params.id),
    });
    return response.status(204).send();
  }
}

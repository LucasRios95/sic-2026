import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { RevokeCertificateUseCase } from './RevokeCertificateUseCase';

export class RevokeCertificateController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(RevokeCertificateUseCase);
    await useCase.execute({
      companyId: request.companyId!,
      userId: request.user!.id,
      certificateId: request.params.id,
    });
    return response.status(204).send();
  }
}

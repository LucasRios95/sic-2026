import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListCertificatesUseCase } from './ListCertificatesUseCase';

export class ListCertificatesController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListCertificatesUseCase);
    const items = await useCase.execute(request.companyId!);
    // Remove vaultRef da resposta — ver UploadCertificateController.toPublicView.
    const safe = items.map(({ vaultRef: _v, ...rest }) => rest);
    return response.json({ data: safe });
  }
}

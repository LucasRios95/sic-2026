import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UploadCertificateUseCase } from './UploadCertificateUseCase';

/**
 * Helper que esconde campos sensíveis da resposta. Mesmo que `Certificate.vaultRef` seja
 * uma referência opaca, evitamos vazá-la no payload público — quem precisa do vaultRef
 * é o backend (use cases de emissão), não o cliente.
 */
function toPublicView(cert: { vaultRef: string } & Record<string, unknown>) {
  const { vaultRef: _vaultRef, ...rest } = cert;
  return rest;
}

export class UploadCertificateController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UploadCertificateUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      userId: request.user!.id,
      pfxBase64: request.body.pfxBase64,
      password: request.body.password,
      alias: request.body.alias,
    });
    return response.status(201).json({
      data: {
        certificate: toPublicView(result.certificate),
        expiresInDays: result.expiresInDays,
      },
    });
  }
}

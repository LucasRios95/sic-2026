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
      data: {
        nfe: result.nfe,
        alreadyEmitted: result.alreadyEmitted,
        // Mensagem da falha de transmissao SOAP/SEFAZ, se houve. Frontend exibe
        // explicitamente; nao silenciar e fingir sucesso quando a nota foi pra
        // PROCESSING por causa de erro de rede/TLS/timeout.
        transmissionError: result.transmissionError ?? null,
      },
    });
  }
}

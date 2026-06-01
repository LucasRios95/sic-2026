import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { DownloadXmlUseCase } from './DownloadXmlUseCase';

export class DownloadXmlController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(DownloadXmlUseCase);
    const result = await useCase.execute({
      companyId: request.companyId!,
      nfeId: request.params.id as string,
    });

    // Content-Disposition: attachment força o download; o filename guia o nome salvo
    // no disco do usuário. Mantemos UTF-8 explícito pra acentos em nomes (RFC 5987).
    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    response.setHeader('X-Nfe-Xml-Tipo', result.tipo);
    return response.send(result.xml);
  }
}

import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CfopEscopo, CfopTipoOperacao } from '../../domain/cfop-enums';
import { ListCfopsUseCase } from './ListCfopsUseCase';

export class ListCfopsController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListCfopsUseCase);
    const items = await useCase.execute({
      search: request.query.search as string | undefined,
      tipoOperacao: request.query.tipoOperacao as CfopTipoOperacao | undefined,
      escopo: request.query.escopo as CfopEscopo | undefined,
      apenasGeraCredito: request.query.apenasGeraCredito === 'true',
      apenasAtivos: request.query.apenasAtivos !== 'false',
    });
    return response.json({ data: items });
  }
}

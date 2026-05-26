import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { INcmRepository } from '../../repositories/INcmRepository';

export class ListNcmsController {
  async handle(request: Request, response: Response): Promise<Response> {
    const repo = container.resolve<INcmRepository>('NcmRepository');
    const { items, total } = await repo.list({
      search: request.query.search as string | undefined,
      apenasValidosNfe: request.query.apenasValidosNfe === 'true',
      nivel: request.query.nivel ? Number(request.query.nivel) : undefined,
      limit: request.query.limit ? Number(request.query.limit) : undefined,
      offset: request.query.offset ? Number(request.query.offset) : undefined,
    });
    return response.json({ data: items, meta: { total } });
  }
}

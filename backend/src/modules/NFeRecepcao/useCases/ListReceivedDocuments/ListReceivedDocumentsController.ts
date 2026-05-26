import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListReceivedDocumentsUseCase } from './ListReceivedDocumentsUseCase';

interface ListQuery {
  status?: string;
  emitenteCnpj?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export class ListReceivedDocumentsController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListReceivedDocumentsUseCase);
    const q = (request.validatedQuery as ListQuery) ?? {};
    const result = await useCase.execute({
      companyId: request.companyId!,
      status: q.status as never,
      emitenteCnpj: q.emitenteCnpj,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: q.limit,
      offset: q.offset,
    });
    return response.json({ data: result.items, meta: { total: result.total } });
  }
}

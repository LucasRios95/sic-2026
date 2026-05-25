import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListNFesUseCase } from './ListNFesUseCase';

interface ListQuery {
  status?: string;
  customerId?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export class ListNFesController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListNFesUseCase);
    const q = (request.validatedQuery as ListQuery) ?? {};
    const result = await useCase.execute({
      companyId: request.companyId!,
      status: q.status,
      customerId: q.customerId,
      search: q.search,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: q.limit,
      offset: q.offset,
    });
    return response.json({ data: result.items, meta: { total: result.total } });
  }
}

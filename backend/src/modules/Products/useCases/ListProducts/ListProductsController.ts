import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListProductsUseCase } from './ListProductsUseCase';

interface ListQuery {
  search?: string;
  ncm?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export class ListProductsController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListProductsUseCase);
    const q = (request.validatedQuery as ListQuery) ?? {};
    const result = await useCase.execute({
      companyId: request.companyId!,
      search: q.search,
      ncm: q.ncm,
      active: q.active,
      limit: q.limit,
      offset: q.offset,
    });
    return response.json({ data: result.items, meta: { total: result.total } });
  }
}

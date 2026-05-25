import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListSuppliersUseCase } from './ListSuppliersUseCase';

interface ListQuery {
  search?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export class ListSuppliersController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListSuppliersUseCase);
    const q = (request.validatedQuery as ListQuery) ?? {};
    const result = await useCase.execute({
      companyId: request.companyId!,
      search: q.search,
      active: q.active,
      limit: q.limit,
      offset: q.offset,
    });
    return response.json({ data: result.items, meta: { total: result.total } });
  }
}

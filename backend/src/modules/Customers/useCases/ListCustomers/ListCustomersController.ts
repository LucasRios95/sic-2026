import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListCustomersUseCase } from './ListCustomersUseCase';

interface ListQuery {
  search?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export class ListCustomersController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListCustomersUseCase);
    const query = (request.validatedQuery as ListQuery) ?? {};
    const result = await useCase.execute({
      companyId: request.companyId!,
      search: query.search,
      active: query.active,
      limit: query.limit,
      offset: query.offset,
    });
    return response.json({ data: result.items, meta: { total: result.total } });
  }
}

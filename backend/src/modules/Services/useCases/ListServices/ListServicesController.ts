import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListServicesUseCase } from './ListServicesUseCase';

interface ListQuery {
  search?: string;
  itemListaServico?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export class ListServicesController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListServicesUseCase);
    const q = (request.validatedQuery as ListQuery) ?? {};
    const result = await useCase.execute({
      companyId: request.companyId!,
      search: q.search,
      itemListaServico: q.itemListaServico,
      active: q.active,
      limit: q.limit,
      offset: q.offset,
    });
    return response.json({ data: result.items, meta: { total: result.total } });
  }
}

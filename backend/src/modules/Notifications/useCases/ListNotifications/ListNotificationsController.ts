import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListNotificationsUseCase } from './ListNotificationsUseCase';

interface ListQuery {
  onlyUnread?: boolean;
  category?: string;
  limit?: number;
  offset?: number;
}

export class ListNotificationsController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListNotificationsUseCase);
    const q = (request.validatedQuery as ListQuery) ?? {};
    const user = request.user!;

    const result = await useCase.execute({
      companyId: request.companyId!,
      userId: user.id,
      onlyUnread: q.onlyUnread,
      category: q.category,
      limit: q.limit,
      offset: q.offset,
    });

    return response.json({
      data: result.items,
      meta: { total: result.total, unread: result.unread },
    });
  }
}

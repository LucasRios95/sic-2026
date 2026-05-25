import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListAuditLogsUseCase } from './ListAuditLogsUseCase';

interface ListQuery {
  companyId?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export class ListAuditLogsController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListAuditLogsUseCase);
    const q = (request.validatedQuery as ListQuery) ?? {};

    // Filtro implícito: o admin só vê logs do próprio tenant. Quando o cliente passa
    // companyId, validamos no middleware tenantContext (já filtrado pelo accessibleCompanyIds).
    const result = await useCase.execute({
      companyId: request.companyId ?? q.companyId,
      userId: q.userId,
      entityType: q.entityType,
      entityId: q.entityId,
      action: q.action,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: q.limit,
      offset: q.offset,
    });

    return response.json({ data: result.items, meta: { total: result.total } });
  }
}

import { inject, injectable } from 'tsyringe';

import {
  IAuditLogRepository,
  ListAuditLogsFilter,
} from '../../repositories/IAuditLogRepository';

@injectable()
export class ListAuditLogsUseCase {
  constructor(
    @inject('AuditLogRepository')
    private readonly repository: IAuditLogRepository,
  ) {}

  /**
   * Filtros disponíveis: companyId, userId, entityType, entityId, action, janela [from, to).
   * Sem filtros, retorna os últimos `limit` (default 50) registros do tenant — útil para
   * monitoramento ad-hoc do admin.
   */
  async execute(filter: ListAuditLogsFilter) {
    return this.repository.list(filter);
  }
}

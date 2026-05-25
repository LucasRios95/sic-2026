import { inject, injectable } from 'tsyringe';

import { getRequestContext } from '@shared/context/request-context';
import { logger } from '@shared/logger';

import {
  CreateAuditLogData,
  IAuditLogRepository,
} from './repositories/IAuditLogRepository';

/**
 * Service centralizado para registro de auditoria. Use cases injetam este serviço e
 * chamam `record(action, ...)` em ações sensíveis.
 *
 * Degradação graciosa: falha ao gravar audit log NÃO derruba a operação principal —
 * loga warning estruturado e segue. Em produção, falhas repetidas são monitoradas via
 * métricas (OpenTelemetry) e tratadas como SEV-3.
 *
 * Enriquecimento automático: campos `userId`, `requestId` e `companyId` são extraídos
 * do AsyncLocalStorage quando não informados explicitamente. Isso simplifica o caller —
 * ele só precisa dizer "o quê" aconteceu; o "quem/onde" o serviço pesca do contexto.
 */
@injectable()
export class AuditService {
  constructor(
    @inject('AuditLogRepository')
    private readonly repository: IAuditLogRepository,
  ) {}

  async record(input: Partial<CreateAuditLogData> & { action: string; entityType: string }): Promise<void> {
    const ctx = getRequestContext();
    const data: CreateAuditLogData = {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      companyId: input.companyId ?? ctx?.companyId ?? null,
      userId: input.userId ?? ctx?.userId ?? null,
      requestId: input.requestId ?? ctx?.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      payload: input.payload ?? null,
    };

    try {
      await this.repository.create(data);
    } catch (err) {
      // Falha local: registra no logger (que já vai pro stdout estruturado). Em produção
      // monitorada por alerta. NÃO repropaga — o caller não tem como tratar.
      logger.warn(
        { err, action: data.action, entityType: data.entityType, entityId: data.entityId },
        'AuditService.record falhou — log perdido',
      );
    }
  }
}

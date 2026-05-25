import { AuditLog } from '../infra/typeorm/entities/AuditLog';

export interface CreateAuditLogData {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  payload?: unknown;
}

export interface ListAuditLogsFilter {
  companyId?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface IAuditLogRepository {
  create(data: CreateAuditLogData): Promise<AuditLog>;
  list(filter: ListAuditLogsFilter): Promise<{ items: AuditLog[]; total: number }>;
}

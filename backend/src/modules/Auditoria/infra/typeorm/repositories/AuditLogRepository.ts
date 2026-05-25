import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateAuditLogData,
  IAuditLogRepository,
  ListAuditLogsFilter,
} from '../../../repositories/IAuditLogRepository';
import { AuditLog } from '../entities/AuditLog';

export class AuditLogRepository implements IAuditLogRepository {
  private readonly repo: Repository<AuditLog>;

  constructor() {
    this.repo = appDataSource.getRepository(AuditLog);
  }

  async create(data: CreateAuditLogData): Promise<AuditLog> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async list(filter: ListAuditLogsFilter): Promise<{ items: AuditLog[]; total: number }> {
    const { limit = 50, offset = 0, from, to } = filter;
    const where: Record<string, unknown> = {};

    if (filter.companyId) where.companyId = filter.companyId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.entityId) where.entityId = filter.entityId;
    if (filter.action) where.action = filter.action;

    if (from && to) where.occurredAt = Between(from, to);
    else if (from) where.occurredAt = MoreThanOrEqual(from);
    else if (to) where.occurredAt = LessThanOrEqual(to);

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { occurredAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }
}

import { Brackets, IsNull, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateNotificationData,
  INotificationRepository,
  ListNotificationsFilter,
} from '../../../repositories/INotificationRepository';
import { Notification } from '../entities/Notification';

export class NotificationRepository implements INotificationRepository {
  private readonly repo: Repository<Notification>;

  constructor() {
    this.repo = appDataSource.getRepository(Notification);
  }

  async create(data: CreateNotificationData): Promise<Notification> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async list(filter: ListNotificationsFilter) {
    const { companyId, userId, onlyUnread, category, limit = 50, offset = 0 } = filter;

    const baseQb = () =>
      this.repo
        .createQueryBuilder('n')
        .where('n.company_id = :companyId', { companyId })
        // Inclui notificações direcionadas (userId = X) e broadcasts (userId IS NULL).
        .andWhere(
          new Brackets((b) => {
            b.where('n.user_id = :userId', { userId }).orWhere('n.user_id IS NULL');
          }),
        );

    const qb = baseQb().orderBy('n.created_at', 'DESC');
    if (onlyUnread) qb.andWhere('n.read_at IS NULL');
    if (category) qb.andWhere('n.category = :category', { category });

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();

    const unread = await baseQb()
      .andWhere('n.read_at IS NULL')
      .getCount();

    return { items, total, unread };
  }

  async markAsRead(id: string, companyId: string, userId: string): Promise<boolean> {
    // Permite marcar broadcasts (user_id IS NULL) — qualquer usuário da empresa pode "fechar"
    // a notificação visualmente. Quando precisarmos manter "lidas por usuário X" para broadcasts,
    // migramos para uma tabela notification_reads(notif_id, user_id).
    const result = await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('id = :id', { id })
      .andWhere('company_id = :companyId', { companyId })
      .andWhere(
        new Brackets((b) => {
          b.where('user_id = :userId', { userId }).orWhere('user_id IS NULL');
        }),
      )
      .andWhere('read_at IS NULL')
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markAllAsRead(companyId: string, userId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('company_id = :companyId', { companyId })
      .andWhere(
        new Brackets((b) => {
          b.where('user_id = :userId', { userId }).orWhere('user_id IS NULL');
        }),
      )
      .andWhere('read_at IS NULL')
      .execute();
    return result.affected ?? 0;
  }
}

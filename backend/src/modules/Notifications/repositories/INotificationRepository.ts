import { Notification, NotificationSeverity } from '../infra/typeorm/entities/Notification';

export interface CreateNotificationData {
  companyId: string;
  userId?: string | null;
  category: string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  link?: string | null;
}

export interface ListNotificationsFilter {
  companyId: string;
  userId: string;
  onlyUnread?: boolean;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface INotificationRepository {
  create(data: CreateNotificationData): Promise<Notification>;
  list(filter: ListNotificationsFilter): Promise<{ items: Notification[]; total: number; unread: number }>;
  /** Marca como lida; retorna se a notificação existia e era do usuário. */
  markAsRead(id: string, companyId: string, userId: string): Promise<boolean>;
  markAllAsRead(companyId: string, userId: string): Promise<number>;
}

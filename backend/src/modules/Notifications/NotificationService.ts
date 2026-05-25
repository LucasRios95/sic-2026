import { inject, injectable } from 'tsyringe';

import { logger } from '@shared/logger';

import { Notification, NotificationSeverity } from './infra/typeorm/entities/Notification';
import {
  CreateNotificationData,
  INotificationRepository,
} from './repositories/INotificationRepository';

/**
 * Service centralizado de notificações. Use cases (e workers, a partir da Fase 1)
 * injetam este serviço para criar entradas na inbox da UI.
 *
 * Falha local degrada graciosamente — quem chama nunca quebra por erro de notificação,
 * exatamente como o AuditService.
 */
@injectable()
export class NotificationService {
  constructor(
    @inject('NotificationRepository')
    private readonly repository: INotificationRepository,
  ) {}

  async notify(data: CreateNotificationData): Promise<Notification | null> {
    try {
      return await this.repository.create(data);
    } catch (err) {
      logger.warn({ err, category: data.category }, 'NotificationService.notify falhou');
      return null;
    }
  }

  /** Atalhos por severidade — caller não precisa importar o enum. */
  async info(input: Omit<CreateNotificationData, 'severity'>): Promise<Notification | null> {
    return this.notify({ ...input, severity: NotificationSeverity.INFO });
  }

  async warn(input: Omit<CreateNotificationData, 'severity'>): Promise<Notification | null> {
    return this.notify({ ...input, severity: NotificationSeverity.WARN });
  }

  async error(input: Omit<CreateNotificationData, 'severity'>): Promise<Notification | null> {
    return this.notify({ ...input, severity: NotificationSeverity.ERROR });
  }
}

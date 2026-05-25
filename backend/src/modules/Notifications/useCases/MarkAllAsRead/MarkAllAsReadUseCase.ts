import { inject, injectable } from 'tsyringe';

import { INotificationRepository } from '../../repositories/INotificationRepository';

@injectable()
export class MarkAllAsReadUseCase {
  constructor(
    @inject('NotificationRepository')
    private readonly repository: INotificationRepository,
  ) {}

  async execute(companyId: string, userId: string): Promise<{ updated: number }> {
    const updated = await this.repository.markAllAsRead(companyId, userId);
    return { updated };
  }
}

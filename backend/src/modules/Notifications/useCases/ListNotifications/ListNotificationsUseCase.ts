import { inject, injectable } from 'tsyringe';

import {
  INotificationRepository,
  ListNotificationsFilter,
} from '../../repositories/INotificationRepository';

@injectable()
export class ListNotificationsUseCase {
  constructor(
    @inject('NotificationRepository')
    private readonly repository: INotificationRepository,
  ) {}

  async execute(filter: ListNotificationsFilter) {
    return this.repository.list(filter);
  }
}

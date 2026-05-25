import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { INotificationRepository } from '../../repositories/INotificationRepository';

@injectable()
export class MarkNotificationAsReadUseCase {
  constructor(
    @inject('NotificationRepository')
    private readonly repository: INotificationRepository,
  ) {}

  async execute(id: string, companyId: string, userId: string): Promise<void> {
    const updated = await this.repository.markAsRead(id, companyId, userId);
    if (!updated) {
      // Pode ser: não existe, é de outro tenant/empresa ou já estava lida.
      throw new NotFoundError('Notificação não encontrada ou já lida');
    }
  }
}

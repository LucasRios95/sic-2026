import { Job } from 'bullmq';
import { container } from 'tsyringe';

import { QueueName } from '@shared/container/providers/QueueProvider/IQueueProvider';
import { BaseWorker } from '@shared/infra/queues/BaseWorker';
import { logger } from '@shared/logger';

import { NotifyExpiringCertificatesUseCase } from '../../useCases/NotifyExpiringCertificates/NotifyExpiringCertificatesUseCase';

/**
 * Worker que dispara a varredura diária de certificados a expirar. Roda na fila
 * `audit-async` (não vale criar uma fila própria — o intervalo é diário, baixo volume).
 *
 * Configurado no `worker.ts` como repeatable com cron diário às 8h (horário UTC).
 */
export class CertificateExpiryWorker extends BaseWorker<{ trigger: 'cron' | 'manual' }> {
  constructor() {
    super(QueueName.AUDIT_ASYNC);
  }

  protected async process(job: Job<{ trigger: 'cron' | 'manual' }>): Promise<void> {
    if (job.name !== 'certificate-expiry-check') {
      // Outras chamadas para a fila audit-async passam reto — só consumimos o nosso job.
      return;
    }
    const useCase = container.resolve(NotifyExpiringCertificatesUseCase);
    const result = await useCase.execute();
    logger.info(
      { examined: result.examined, notified: result.notified, trigger: job.data.trigger },
      'Varredura de expiração de certificados concluída',
    );
  }
}

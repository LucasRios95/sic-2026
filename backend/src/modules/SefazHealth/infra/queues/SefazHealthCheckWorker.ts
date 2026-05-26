import { Job } from 'bullmq';
import { container } from 'tsyringe';

import { ICertificateRepository } from '@modules/Certificates/repositories/ICertificateRepository';
import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { QueueName } from '@shared/container/providers/QueueProvider/IQueueProvider';
import { BaseWorker } from '@shared/infra/queues/BaseWorker';
import { logger } from '@shared/logger';

import { SefazHealthMonitorService } from '../../SefazHealthMonitorService';

export interface SefazHealthCheckPayload {
  /** Quando omitido, probemos os dois ambientes. */
  ambiente?: AmbienteSefaz;
  trigger?: 'cron' | 'manual';
}

/**
 * Worker que dispara o probing periódico das autorizadoras. Compartilha a fila
 * `audit-async` com outros jobs administrativos de baixa frequência. Distinguido pelo
 * `job.name`: `sefaz-health-sweep`.
 *
 * O probe usa o primeiro certificado A1 ativo encontrado cross-tenant. Quando NÃO há
 * certificado nenhum (instalação nova sem PFX cadastrado), pulamos a varredura — não
 * há como falar com a SEFAZ, e a próxima execução tenta de novo.
 */
export class SefazHealthCheckWorker extends BaseWorker<SefazHealthCheckPayload> {
  constructor() {
    super(QueueName.AUDIT_ASYNC);
  }

  protected async process(job: Job<SefazHealthCheckPayload>): Promise<void> {
    if (job.name !== 'sefaz-health-sweep') {
      return;
    }
    const monitor = container.resolve(SefazHealthMonitorService);
    const certRepo = container.resolve<ICertificateRepository>('CertificateRepository');

    const cert = await certRepo.findFirstActive();
    if (!cert) {
      logger.info('Sem certificado A1 ativo — varredura SEFAZ pulada nesta rodada');
      return;
    }

    const ambientes = job.data.ambiente
      ? [job.data.ambiente]
      : [AmbienteSefaz.HOMOLOGACAO, AmbienteSefaz.PRODUCAO];

    for (const amb of ambientes) {
      try {
        const outcomes = await monitor.probeAll({
          ambiente: amb,
          companyId: cert.companyId,
          certificateVaultRef: cert.vaultRef,
        });
        const downs = outcomes.filter((o) => o.state === 'DOWN');
        logger.info(
          { ambiente: amb, total: outcomes.length, down: downs.length },
          'Varredura SEFAZ concluída',
        );
        if (downs.length > 0) {
          logger.warn(
            { ambiente: amb, downs: downs.map((d) => d.autorizadora) },
            'Autorizadoras em DOWN nesta varredura',
          );
        }
      } catch (err) {
        logger.warn({ err, ambiente: amb }, 'Falha ao executar varredura SEFAZ');
      }
    }
  }
}

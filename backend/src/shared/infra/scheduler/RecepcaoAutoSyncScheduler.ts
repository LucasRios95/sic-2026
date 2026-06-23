import { container } from 'tsyringe';

import { env } from '@config/env';
import { Certificate } from '@modules/Certificates/infra/typeorm/entities/Certificate';
import { SincronizarRecebidosUseCase } from '@modules/NFeRecepcao/useCases/SincronizarRecebidos/SincronizarRecebidosUseCase';
import { appDataSource } from '@shared/infra/typeorm/data-source';
import { logger } from '@shared/logger';

export class RecepcaoAutoSyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(): void {
    if (env.RECEPCAO_AUTO_SYNC !== 'on') {
      logger.info('Recepção automática DF-e in-process desligada');
      return;
    }

    const intervalMs = env.RECEPCAO_AUTO_SYNC_INTERVAL_MINUTES * 60_000;
    this.timer = setInterval(() => void this.runSweep(), intervalMs);
    this.timer.unref();

    logger.info(
      { intervalMinutes: env.RECEPCAO_AUTO_SYNC_INTERVAL_MINUTES },
      'Recepção automática DF-e in-process iniciada',
    );
    void this.runSweep();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runSweep(): Promise<void> {
    if (this.running) {
      logger.info('Recepção automática DF-e já está em execução — varredura pulada');
      return;
    }

    this.running = true;
    try {
      const certificates = await appDataSource
        .getRepository(Certificate)
        .createQueryBuilder('cert')
        .where('cert.active = true')
        .andWhere('cert.revoked_at IS NULL')
        .andWhere('cert.valid_from <= now()')
        .andWhere('cert.valid_to >= now()')
        .orderBy('cert.company_id', 'ASC')
        .addOrderBy('cert.valid_to', 'DESC')
        .getMany();

      const seenCompanies = new Set<string>();
      const useCase = container.resolve(SincronizarRecebidosUseCase);

      for (const cert of certificates) {
        if (seenCompanies.has(cert.companyId)) continue;
        seenCompanies.add(cert.companyId);

        try {
          const result = await useCase.execute({
            companyId: cert.companyId,
            certificateVaultRef: cert.vaultRef,
            maxIterations: env.RECEPCAO_AUTO_SYNC_MAX_ITERATIONS,
          });
          logger.info(
            {
              companyId: cert.companyId,
              capturedDocs: result.capturedDocs,
              iterations: result.iterations,
              cStat: result.lastCStat,
              xMotivo: result.xMotivo,
            },
            'Recepção automática DF-e concluída para empresa',
          );
        } catch (err) {
          logger.warn(
            { err, companyId: cert.companyId },
            'Falha na recepção automática DF-e para empresa',
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}

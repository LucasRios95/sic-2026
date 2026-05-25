import { Job } from 'bullmq';
import { container } from 'tsyringe';

import { QueueName } from '@shared/container/providers/QueueProvider/IQueueProvider';
import { BaseWorker } from '@shared/infra/queues/BaseWorker';
import { logger } from '@shared/logger';

import { ICertificateVault } from '@shared/container/providers/CertificateVault/ICertificateVault';

import { INFeRepository } from '../../repositories/INFeRepository';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { ReconcileNFeUseCase } from '../../useCases/ReconcileNFe/ReconcileNFeUseCase';
import { IIntegrationCredentialResolver } from './IIntegrationCredentialResolver';

export interface NFeReconciliationPayload {
  /** Quando vazio, o worker varre por NFe stale; quando preenchido, reconcilia somente essa. */
  nfeId?: string;
  /** Idade mínima em minutos para varrer (default 1). */
  minIdleMinutes?: number;
  /** Limite por execução (default 50). */
  limit?: number;
  requestId?: string;
}

/**
 * Worker BullMQ que reconcilia NF-e em status PROCESSING. Roda em modo *repeatable*
 * (cron) e também aceita disparo pontual para uma NFe específica.
 *
 * Estratégia para descobrir o certificado a usar:
 *  - Cada empresa tem 1 certificado A1 ativo cadastrado em `IntegrationCredential`
 *    (Fase EP-06b — provisionamento de certificado, ainda em curso).
 *  - Para esta versão, o worker depende de um `IIntegrationCredentialResolver` que
 *    devolve o `vaultRef` por companyId. O resolver é registrado no container e pode
 *    consultar a tabela `certificates` (entidade prevista no schema Prisma v1.3) ou
 *    cair em uma config por empresa.
 *  - Se o resolver não consegue achar cert para uma empresa, a NFe é pulada com warning
 *    em vez de marcar como ERROR (problema de configuração, não de fluxo fiscal).
 *
 * Política de retentativa:
 *  - O próprio job tem `attempts: 5` (default BullMQ) — falhas transitórias retentam.
 *  - Para uma NFe específica, o worker consulta UMA vez por execução; varias execuções
 *    consecutivas vão tentando até a SEFAZ resolver ou até a NFe sair de PROCESSING.
 */
export class NFeReconciliationWorker extends BaseWorker<NFeReconciliationPayload> {
  constructor() {
    super(QueueName.NFE_DISTRIBUICAO);
  }

  protected async process(job: Job<NFeReconciliationPayload>): Promise<void> {
    const useCase = container.resolve(ReconcileNFeUseCase);
    const credentialResolver = container.resolve<IIntegrationCredentialResolver>(
      'IntegrationCredentialResolver',
    );

    if (job.data.nfeId) {
      // Disparo pontual
      const nfeRepo = container.resolve<INFeRepository>('NFeRepository');
      const nfe = await nfeRepo.findByIdAny(job.data.nfeId);
      if (!nfe) {
        logger.warn({ nfeId: job.data.nfeId }, 'NFe alvo de reconciliação não existe — pulando');
        return;
      }
      await this.reconcileOne(useCase, credentialResolver, nfe.id, nfe.companyId);
      return;
    }

    // Varredura periódica
    const nfeRepo = container.resolve<INFeRepository>('NFeRepository');
    const stale = await nfeRepo.listStaleProcessing(
      job.data.minIdleMinutes ?? 1,
      job.data.limit ?? 50,
    );

    logger.info({ count: stale.length }, 'Varredura de reconciliação iniciada');

    for (const nfe of stale) {
      try {
        await this.reconcileOne(useCase, credentialResolver, nfe.id, nfe.companyId);
      } catch (err) {
        // Não derruba o job por uma NFe específica — continua processando as demais.
        logger.warn(
          { err, nfeId: nfe.id, companyId: nfe.companyId },
          'Falha ao reconciliar NFe individual; seguindo',
        );
      }
    }
  }

  private async reconcileOne(
    useCase: ReconcileNFeUseCase,
    credentialResolver: IIntegrationCredentialResolver,
    nfeId: string,
    companyId: string,
  ): Promise<void> {
    const vaultRef = await credentialResolver.resolveCertificateRef(companyId);
    if (!vaultRef) {
      logger.warn(
        { nfeId, companyId },
        'Sem certificado registrado para a empresa — pulando reconciliação',
      );
      return;
    }
    await useCase.execute({ nfeId, certificateVaultRef: vaultRef });
  }

  /** Suprime aviso "ICompanyRepository não usado" — depende dele transitivamente. */
  private _untouchedCompanyRepoMark?: ICompanyRepository;
  /** Mesmo motivo para o vault — futuras versões do worker podem usar diretamente. */
  private _untouchedVaultMark?: ICertificateVault;
}

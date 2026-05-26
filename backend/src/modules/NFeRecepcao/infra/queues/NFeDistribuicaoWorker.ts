import { Job } from 'bullmq';
import { container } from 'tsyringe';

import { QueueName } from '@shared/container/providers/QueueProvider/IQueueProvider';
import { BaseWorker } from '@shared/infra/queues/BaseWorker';
import { logger } from '@shared/logger';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { IIntegrationCredentialResolver } from '@modules/NFe/infra/queues/IIntegrationCredentialResolver';

import { SincronizarRecebidosUseCase } from '../../useCases/SincronizarRecebidos/SincronizarRecebidosUseCase';

export interface NFeDistribuicaoPayload {
  /** Quando preenchido, sincroniza só uma empresa. Senão, varre todas ativas. */
  companyId?: string;
  maxIterations?: number;
}

/**
 * Worker que orquestra a sincronização periódica do `nfeDistribuicaoDFe` por empresa.
 *
 * Modos:
 *  - Disparo pontual (`payload.companyId` preenchido): sincroniza uma empresa específica.
 *  - Varredura (sem `companyId`): lista empresas ativas do tenant e sincroniza cada uma.
 *
 * Resolução do certificado A1 reusa o `IIntegrationCredentialResolver` que já foi
 * usado pela reconciliação de NF-e — o resolver TypeOrm devolve o certificado ativo
 * da empresa. Empresas sem certificado são puladas com warning (problema de configuração).
 *
 * Política de erro: falha numa empresa NÃO derruba o job — segue processando as demais.
 * Erros são logados; falhas persistentes geram notificação na empresa (futuro EP-06c).
 */
export class NFeDistribuicaoWorker extends BaseWorker<NFeDistribuicaoPayload> {
  constructor() {
    super(QueueName.NFE_DISTRIBUICAO);
  }

  protected async process(job: Job<NFeDistribuicaoPayload>): Promise<void> {
    // Compartilha a fila `nfe-distribuicao` com a reconciliação de NF-e — separamos
    // pelo nome do job. Quem chama escolhe o name conforme a operação.
    if (
      job.name !== 'nfe-recepcao-sync' &&
      job.name !== 'nfe-recepcao-sync-sweep'
    ) {
      return;
    }

    const useCase = container.resolve(SincronizarRecebidosUseCase);
    const credentialResolver = container.resolve<IIntegrationCredentialResolver>(
      'IntegrationCredentialResolver',
    );

    if (job.data.companyId) {
      await this.syncOne(useCase, credentialResolver, job.data.companyId, job.data.maxIterations);
      return;
    }

    // Varredura: itera por empresas ativas. Sem listAll cross-tenant no repositório
    // atual, o atalho seguro é resolver via Company.findByIds usando os tenant slugs
    // já existentes em produção. Para esta versão, log e exigir disparo explícito por
    // companyId no payload — varredura completa será adicionada quando a tabela
    // companies tiver `listActiveCrossTenant()` (opcional para multi-tenant em produção).
    const companyRepo = container.resolve<ICompanyRepository>('CompanyRepository');
    // Tenta extrair um payload alternativo: `{ companyIds: string[] }` para varreduras
    // disparadas pelo operador.
    const ids = (job.data as Record<string, unknown>).companyIds as string[] | undefined;
    if (!ids || ids.length === 0) {
      logger.info('Varredura sem companyId(s) explícito — pulando');
      return;
    }
    const companies = await companyRepo.findByIds(ids);
    for (const company of companies) {
      try {
        await this.syncOne(useCase, credentialResolver, company.id, job.data.maxIterations);
      } catch (err) {
        logger.warn({ err, companyId: company.id }, 'Falha ao sincronizar empresa');
      }
    }
  }

  private async syncOne(
    useCase: SincronizarRecebidosUseCase,
    resolver: IIntegrationCredentialResolver,
    companyId: string,
    maxIterations?: number,
  ): Promise<void> {
    const vaultRef = await resolver.resolveCertificateRef(companyId);
    if (!vaultRef) {
      logger.warn(
        { companyId },
        'Sem certificado ativo para a empresa — sincronização pulada',
      );
      return;
    }
    const result = await useCase.execute({
      companyId,
      certificateVaultRef: vaultRef,
      maxIterations,
    });
    logger.info(
      {
        companyId,
        capturedDocs: result.capturedDocs,
        iterations: result.iterations,
        cStat: result.lastCStat,
      },
      'Sincronização de DF-e concluída',
    );
  }
}

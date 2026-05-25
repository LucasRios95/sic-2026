import 'reflect-metadata';

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { container } from 'tsyringe';

import { env } from '@config/env';
import { registerDependencies } from '@shared/container';
import { QueueName } from '@shared/container/providers/QueueProvider/IQueueProvider';
import { appDataSource } from '@shared/infra/typeorm/data-source';
import { logger } from '@shared/logger';

import { CertificateExpiryWorker } from '@modules/Certificates/infra/queues/CertificateExpiryWorker';
import { IIntegrationCredentialResolver } from '@modules/NFe/infra/queues/IIntegrationCredentialResolver';
import { NFeReconciliationWorker } from '@modules/NFe/infra/queues/NFeReconciliationWorker';
import { TypeOrmIntegrationCredentialResolver } from '@modules/NFe/infra/queues/TypeOrmIntegrationCredentialResolver';

/**
 * Entrada do processo de WORKERS. Roda separadamente do servidor HTTP — assim, o
 * processamento de filas escala independentemente da camada de request. Em produção,
 * é o mesmo contêiner com `command: ["npm", "run", "start:worker"]`.
 *
 * Lifecycle:
 *  1. registerDependencies() — popula o container.
 *  2. appDataSource.initialize() — workers precisam de acesso ao banco.
 *  3. Conecta um Redis dedicado para os Workers (BullMQ exige conexão separada da do
 *     QueueProvider produtor — não pode ser compartilhada).
 *  4. Inicializa cada worker concreto.
 *  5. Registra jobs repeatable (NFe reconciliação a cada 2 min, expiração de certificado
 *     diariamente).
 *  6. Graceful shutdown em SIGINT/SIGTERM.
 */
async function bootstrap(): Promise<void> {
  logger.info('Iniciando processo de workers');
  registerDependencies();

  // O `IntegrationCredentialResolver` agora usa a entidade Certificate (EP-06b).
  // Em ambientes onde a tabela ainda não foi populada, o resolver devolve null e o
  // worker simplesmente pula a NFe correspondente com warning.
  container.registerSingleton<IIntegrationCredentialResolver>(
    'IntegrationCredentialResolver',
    TypeOrmIntegrationCredentialResolver,
  );

  await appDataSource.initialize();
  logger.info({ database: env.DB_NAME }, 'Conexão com o banco estabelecida');

  const workerConnection = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
  });

  const reconciliationWorker = new NFeReconciliationWorker();
  reconciliationWorker.start(workerConnection);

  const certificateExpiryWorker = new CertificateExpiryWorker();
  certificateExpiryWorker.start(workerConnection);

  // Jobs repeatable. jobId fixo evita acumular duplicatas em restarts.
  const nfeQueue = new Queue(QueueName.NFE_DISTRIBUICAO, {
    connection: workerConnection,
    prefix: env.QUEUE_PREFIX,
  });
  await nfeQueue.add(
    'nfe-reconciliation-sweep',
    { minIdleMinutes: 1, limit: 50 },
    {
      repeat: { every: 2 * 60_000 },
      jobId: 'nfe-reconciliation-sweep',
    },
  );

  // Varredura diária de certificados a expirar — 8h UTC = 5h BRT.
  const auditQueue = new Queue(QueueName.AUDIT_ASYNC, {
    connection: workerConnection,
    prefix: env.QUEUE_PREFIX,
  });
  await auditQueue.add(
    'certificate-expiry-check',
    { trigger: 'cron' },
    {
      repeat: { pattern: '0 8 * * *' }, // 08:00 UTC todos os dias
      jobId: 'certificate-expiry-check',
    },
  );

  logger.info('Workers prontos — aguardando jobs');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Encerrando workers graciosamente');
    await reconciliationWorker.close();
    await certificateExpiryWorker.close();
    await nfeQueue.close();
    await auditQueue.close();
    workerConnection.disconnect();
    await appDataSource.destroy().catch((err) => logger.warn({ err }, 'Erro ao fechar DB'));
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Falha ao iniciar workers');
  process.exit(1);
});

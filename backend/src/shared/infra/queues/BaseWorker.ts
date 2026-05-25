import { Job, Worker, WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';

import { env } from '@config/env';
import { runWithRequestContext } from '@shared/context/request-context';
import { logger } from '@shared/logger';

import { QueueName } from '@shared/container/providers/QueueProvider/IQueueProvider';

/**
 * Superclasse para workers BullMQ. Centraliza:
 *  - propagação de requestId (extraído do payload, se houver) via AsyncLocalStorage,
 *    para que os logs do processamento se correlacionem com a request original que enfileirou.
 *  - logging estruturado de início/sucesso/falha com duração.
 *  - hook `onFailedFinal` para notificar humano quando o job esgota tentativas.
 *
 * Implementações concretas (ex.: NFeEmitWorker na Fase 1a) só implementam `process()`.
 *
 * Nota: workers NÃO sobem por padrão com o servidor HTTP. Eles devem ser inicializados
 * num processo dedicado (escalável independentemente do HTTP), via `npm run worker` —
 * script a ser adicionado quando o primeiro worker concreto entrar.
 */
export abstract class BaseWorker<TPayload> {
  protected readonly queueName: QueueName;
  private worker: Worker | null = null;

  constructor(queueName: QueueName) {
    this.queueName = queueName;
  }

  protected abstract process(job: Job<TPayload>): Promise<void>;

  /** Chamado quando o job esgotou todas as tentativas. Override para notificar humanos. */
  protected async onFailedFinal(job: Job<TPayload>, err: Error): Promise<void> {
    logger.error(
      { jobId: job.id, queue: this.queueName, attempts: job.attemptsMade, err: err.message },
      'Job falhou definitivamente após todas as tentativas',
    );
  }

  start(connection: Redis, options: Partial<WorkerOptions> = {}): void {
    this.worker = new Worker<TPayload>(
      this.queueName,
      async (job) => this.runWithContext(job),
      {
        connection,
        prefix: env.QUEUE_PREFIX,
        concurrency: 5,
        ...options,
      },
    );

    this.worker.on('completed', (job, _result, _prev) => {
      const duration = Date.now() - (job.processedOn ?? job.timestamp);
      logger.info(
        { jobId: job.id, queue: this.queueName, durationMs: duration },
        'Job concluído',
      );
    });

    this.worker.on('failed', async (job, err) => {
      if (!job) return;
      logger.warn(
        {
          jobId: job.id,
          queue: this.queueName,
          attempt: job.attemptsMade,
          maxAttempts: job.opts.attempts,
          err: err.message,
        },
        'Job falhou — tentativa registrada',
      );
      const isFinal = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (isFinal) await this.onFailedFinal(job, err);
    });
  }

  private async runWithContext(job: Job<TPayload>): Promise<void> {
    const requestId =
      (job.data as Record<string, unknown>)?.requestId?.toString() ??
      `job-${job.id ?? 'unknown'}`;
    await runWithRequestContext({ requestId }, async () => {
      await this.process(job);
    });
  }

  async close(): Promise<void> {
    await this.worker?.close();
  }
}

import { Queue } from 'bullmq';
import Redis, { Redis as RedisClient } from 'ioredis';

import { env } from '@config/env';
import { logger } from '@shared/logger';

import { IQueueProvider, JobOptions, QueueName } from '../IQueueProvider';

/**
 * Implementação de IQueueProvider sobre BullMQ + Redis.
 *
 * Decisões:
 *  - `lazyConnect: true` no ioredis permite que a aplicação suba mesmo sem Redis
 *    disponível; só a primeira chamada `.add()` tenta conectar. Importante em dev,
 *    onde Redis nem sempre está rodando.
 *  - Política padrão de retry: 5 tentativas, exponential backoff começando em 5s.
 *    Falhas finais vão para uma "failed jobs queue" implícita do BullMQ e ficam
 *    visíveis no Bull Board (a configurar como rota admin futuramente).
 *  - Prefixo de fila isola ambientes (dev/homol/prod) no mesmo Redis se preciso.
 *
 * Workers concretos serão registrados nas próximas fases (ex.: `nfe-emit` na Fase 1a).
 * Esta classe expõe apenas o lado PRODUCER + a inicialização do connection pool.
 */
export class BullMqQueueProvider implements IQueueProvider {
  private connection: RedisClient | null = null;
  private readonly queues = new Map<QueueName, Queue>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.connection = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      // BullMQ exige `maxRetriesPerRequest: null` em conexões compartilhadas com workers.
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    this.connection.on('error', (err) => {
      logger.warn({ err }, 'Redis connection error — filas em modo degradado');
    });

    // Filas conhecidas — pré-instancia para reduzir latência da primeira chamada.
    for (const name of Object.values(QueueName)) {
      const queue = new Queue(name, {
        connection: this.connection,
        prefix: env.QUEUE_PREFIX,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 30 * 24 * 3600 }, // mantém 30 dias para investigação
        },
      });
      this.queues.set(name, queue);
    }

    this.initialized = true;
    logger.info(
      { queues: [...this.queues.keys()], prefix: env.QUEUE_PREFIX },
      'BullMQ inicializado',
    );
  }

  async add<T>(queue: QueueName, payload: T, options: JobOptions = {}): Promise<void> {
    if (!this.initialized) await this.initialize();
    const target = this.queues.get(queue);
    if (!target) throw new Error(`Fila ${queue} não registrada`);

    try {
      await target.add(queue, payload as unknown as Record<string, unknown>, {
        jobId: options.jobId,
        delay: options.delay,
        attempts: options.attempts,
      });
    } catch (err) {
      // Degradação graciosa: não derrubar a operação principal por falha na fila.
      // Quem chama decide se promove para erro (ex.: audit log fiscal crítico).
      logger.warn({ err, queue }, 'Falha ao enfileirar — degradando');
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
    this.initialized = false;
  }
}

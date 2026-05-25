/**
 * Abstração das filas usadas pelo backend. Mantém o domínio livre de BullMQ (DIP) —
 * use cases enfileiram via `IQueueProvider.add(queue, job)` sem conhecer Redis.
 *
 * As filas conhecidas pelo sistema ficam no enum QueueName. Quando uma nova fila é
 * necessária (ex.: 'nfe-emit' na Fase 1a), adicionar aqui + registrar no QueueProvider.
 */
export enum QueueName {
  AUDIT_ASYNC = 'audit-async',
  /** Reservadas para fases seguintes — não emitem trabalho ainda. */
  NFE_EMIT = 'nfe-emit',
  NFE_DISTRIBUICAO = 'nfe-distribuicao',
  FOCUS_WEBHOOK = 'focus-webhook',
  IMPORT_XML = 'import-xml',
  REPORTS = 'reports',
}

export interface JobOptions {
  /** Identificador idempotente; tentativas com o mesmo jobId são deduplicadas. */
  jobId?: string;
  /** Delay em ms antes da primeira execução. */
  delay?: number;
  /** Máximo de tentativas (incluindo a primeira). */
  attempts?: number;
}

export interface IQueueProvider {
  /**
   * Enfileira uma carga útil para processamento assíncrono. Quando a fila não está
   * disponível (Redis indisponível em dev sem `docker compose up`), a implementação
   * faz fallback gracioso (log de warning) — o caller decide se a operação principal
   * deve falhar ou degradar.
   */
  add<T>(queue: QueueName, payload: T, options?: JobOptions): Promise<void>;

  /** Inicializa as conexões Redis (chamado no bootstrap). */
  initialize(): Promise<void>;

  /** Encerra graciosamente (chamado no shutdown). */
  shutdown(): Promise<void>;
}

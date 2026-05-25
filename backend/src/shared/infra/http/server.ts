import 'reflect-metadata';

import { container } from 'tsyringe';

import { env } from '@config/env';
import { logger } from '@shared/logger';
import { initializeTelemetry } from '@shared/telemetry/opentelemetry';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IQueueProvider } from '@shared/container/providers/QueueProvider/IQueueProvider';

import { createApp } from './app';

async function bootstrap(): Promise<void> {
  // OpenTelemetry precisa ser inicializado ANTES do Express ser importado, para que as
  // auto-instrumentations consigam interceptar. `initializeTelemetry` faz isso e retorna
  // null quando OTEL_EXPORTER_OTLP_ENDPOINT está vazio (sem overhead em dev).
  const otel = await initializeTelemetry();

  await appDataSource.initialize();
  logger.info({ database: env.DB_NAME }, 'Conexão com o banco de dados estabelecida');

  const app = createApp();

  // Inicializa QueueProvider em modo lazy — conexão Redis só acontece se houver `add()`.
  // Quando o primeiro worker concreto entrar (Fase 1a), aqui também subimos os workers.
  const queue = container.resolve<IQueueProvider>('QueueProvider');
  await queue.initialize().catch((err) => {
    logger.warn({ err }, 'QueueProvider em modo degradado — Redis indisponível');
  });

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `Servidor sic-2026-backend ouvindo em http://localhost:${env.PORT}`,
    );
  });

  // Graceful shutdown: encerra HTTP, filas e telemetria antes de matar o processo.
  // Importante em produção para não perder jobs em vôo nem traces.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Encerrando graciosamente');
    server.close();
    await queue.shutdown().catch((err) => logger.warn({ err }, 'Erro ao fechar QueueProvider'));
    await appDataSource.destroy().catch((err) => logger.warn({ err }, 'Erro ao fechar DataSource'));
    if (otel) await otel.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Falha ao subir o servidor');
  process.exit(1);
});

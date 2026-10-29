import { logger } from '@shared/logger';

import { env } from '@config/env';

/**
 * Inicialização opt-in do OpenTelemetry. Quando `OTEL_EXPORTER_OTLP_ENDPOINT` não
 * está definido, retorna no-op imediatamente — o backend roda sem nenhum overhead
 * de tracing/metrics em dev.
 *
 * Quando o endpoint está definido, registramos:
 *  - auto-instrumentations: Express, HTTP, ioredis, pg, pino
 *  - resource attributes: service.name, deployment.environment
 *  - exporter OTLP HTTP (compatível com Tempo, Jaeger, Datadog Agent, Honeycomb)
 *
 * IMPORTANTE: este setup precisa rodar ANTES de qualquer `require('express')` em
 * tempo de execução para que as auto-instrumentations consigam interceptar. Por isso
 * é chamado no início do `server.ts`.
 */
export async function initializeTelemetry(): Promise<{ shutdown: () => Promise<void> } | null> {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return null;
  }

  // Importação dinâmica: módulos OTel são pesados e só pagamos o custo quando habilitado.
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
  // `Resource` é a API do @opentelemetry/resources 1.x, que é a linha pareada com o
  // sdk-node 0.57 instalado aqui. O helper `resourceFromAttributes` só existe a partir
  // do resources 2.x — usá-lo derrubava o boot com "não é uma função" assim que
  // OTEL_EXPORTER_OTLP_ENDPOINT fosse definido.
  const { Resource } = await import('@opentelemetry/resources');
  const {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
  } = await import('@opentelemetry/semantic-conventions');

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: '0.1.0',
      'deployment.environment': env.NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Pino já cuida do log; não instrumentar fs evita ruído enorme em dev.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  logger.info(
    { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT, service: env.OTEL_SERVICE_NAME },
    'OpenTelemetry inicializado',
  );

  return {
    shutdown: async () => {
      try {
        await sdk.shutdown();
      } catch (err) {
        logger.warn({ err }, 'Falha ao encerrar OpenTelemetry');
      }
    },
  };
}

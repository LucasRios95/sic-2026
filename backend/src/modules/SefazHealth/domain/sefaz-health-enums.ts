/**
 * Estado conhecido de uma autorizadora SEFAZ. Lido pelo `EmitirNFeUseCase` para decidir
 * roteamento normal vs. contingência SVC.
 *
 *  - UP        — última probe respondeu cStat 107 dentro do timeout.
 *  - DEGRADED  — respostas erráticas ou latência alta (>= LATENCY_DEGRADED_MS) — ainda
 *                tenta normal, mas marca alerta.
 *  - DOWN      — N probes consecutivas falharam OU cStat 108/109/999 — entra em
 *                contingência (SVC quando o serviço suporta; EPEC manual quando SVC
 *                também está fora).
 *  - UNKNOWN   — ainda não probamos desde o boot.
 */
export enum SefazHealthState {
  UP = 'UP',
  DEGRADED = 'DEGRADED',
  DOWN = 'DOWN',
  UNKNOWN = 'UNKNOWN',
}

/** Latência (ms) a partir da qual marcamos DEGRADED mesmo com cStat 107. */
export const LATENCY_DEGRADED_MS = 5000;

/**
 * Falhas consecutivas necessárias para promover de UP/DEGRADED para DOWN. Mantemos baixo
 * (3) porque a SEFAZ raramente oscila — quando o serviço cai, cai por minutos/horas.
 */
export const CONSECUTIVE_FAILURES_TO_DOWN = 3;

/**
 * Probes consecutivas com cStat 107 necessárias para sair de DOWN. Histerese — evita
 * flapping quando a SEFAZ se recupera intermitentemente.
 */
export const CONSECUTIVE_SUCCESSES_TO_UP = 2;

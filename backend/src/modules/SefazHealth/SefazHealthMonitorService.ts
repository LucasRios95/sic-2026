import { inject, injectable } from 'tsyringe';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { UF_CODIGO } from '@modules/NFe/domain/nfe-enums';
import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';
import { logger } from '@shared/logger';

import {
  CONSECUTIVE_FAILURES_TO_DOWN,
  CONSECUTIVE_SUCCESSES_TO_UP,
  LATENCY_DEGRADED_MS,
  SefazHealthState,
} from './domain/sefaz-health-enums';
import { SefazHealthStatus } from './infra/typeorm/entities/SefazHealthStatus';
import { ISefazHealthStatusRepository } from './repositories/ISefazHealthStatusRepository';

/**
 * Tabela de autorizadoras conhecidas → UF representativa para probar. A UF é só usada
 * para roteamento de `SefazEndpoints.url()` — toda SP-UF cai na autorizadora SP, então
 * basta uma. SVC-AN e SVC-RS são probadas com `contingenciaSvc: true`.
 *
 * IMPORTANTE: a fonte da verdade aqui é manual e CONVERGE com `SefazEndpoints.ts`. Se
 * uma nova autorizadora entrar lá, adicionar uma entrada aqui também.
 */
const AUTORIDADES_CONHECIDAS: Array<{
  autorizadora: string;
  sampleUf: string;
  contingenciaSvc?: boolean;
}> = [
  { autorizadora: 'SP', sampleUf: 'SP' },
  { autorizadora: 'RS', sampleUf: 'RS' },
  { autorizadora: 'MG', sampleUf: 'MG' },
  { autorizadora: 'BA', sampleUf: 'BA' },
  { autorizadora: 'AM', sampleUf: 'AM' },
  { autorizadora: 'SVRS', sampleUf: 'AC' }, // AC usa SVRS como autorizadora real
  { autorizadora: 'SVAN', sampleUf: 'MA' }, // MA usa SVAN
  { autorizadora: 'SVC-AN', sampleUf: 'SP', contingenciaSvc: true },
  { autorizadora: 'SVC-RS', sampleUf: 'AC', contingenciaSvc: true },
];

export interface ProbeOutcome {
  autorizadora: string;
  ambiente: AmbienteSefaz;
  state: SefazHealthState;
  cStat: string | null;
  xMotivo: string | null;
  latencyMs: number;
}

/**
 * Service central de saúde da SEFAZ — PRD seção 6.2.1 / TSK-103.
 *
 * Responsabilidades:
 *  - `probe(...)` — dispara um `NFeStatusServico4` contra uma autorizadora específica,
 *    aplica a máquina de estados (histerese de 3 falhas para DOWN, 2 sucessos para UP)
 *    e persiste o resultado.
 *  - `probeAll(...)` — usado pelo worker periódico, varre todas as autorizadoras conhecidas.
 *  - `isAvailable(...)` — leitura síncrona para o `EmitirNFeUseCase` decidir se rota normal
 *    ou se entra em contingência SVC.
 *
 * O service NÃO conhece quem faz a chamada (worker vs. boot manual via admin) — recebe
 * o `certificateVaultRef` injetado pelo caller. Em produção, o worker resolve um
 * certificado A1 ativo qualquer (NFeStatusServico4 é leitura, não exige que o CNPJ do
 * cert seja o "alvo" da consulta).
 */
@injectable()
export class SefazHealthMonitorService {
  constructor(
    @inject('SefazHealthStatusRepository')
    private readonly repo: ISefazHealthStatusRepository,

    @inject(SefazSoapClient)
    private readonly soap: SefazSoapClient,
  ) {}

  /**
   * Lê o estado atual sem fazer probe — chamado pelo `EmitirNFeUseCase`.
   * Quando não há registro (autorizadora nunca probada), retorna UNKNOWN → o caller
   * decide o que fazer (geralmente assume UP para não bloquear emissão por desconhecimento).
   */
  async getState(
    autorizadora: string,
    ambiente: AmbienteSefaz,
  ): Promise<{ state: SefazHealthState; since: Date | null }> {
    const found = await this.repo.find(autorizadora, ambiente);
    if (!found) return { state: SefazHealthState.UNKNOWN, since: null };
    return { state: found.state, since: found.stateSince ?? null };
  }

  /**
   * Decisão composta para o caller fiscal: "posso emitir pela autorizadora normal?".
   * UP e DEGRADED → sim. DOWN → não (entrar em contingência). UNKNOWN → sim (não bloqueia
   * primeira emissão).
   */
  async isAvailable(autorizadora: string, ambiente: AmbienteSefaz): Promise<boolean> {
    const { state } = await this.getState(autorizadora, ambiente);
    return state !== SefazHealthState.DOWN;
  }

  async list(): Promise<SefazHealthStatus[]> {
    return this.repo.list();
  }

  /**
   * Probe único contra uma autorizadora. Retorna o estado final calculado APÓS aplicar
   * a máquina de transições — não retorna o cStat cru.
   */
  async probe(input: {
    autorizadora: string;
    sampleUf: string;
    ambiente: AmbienteSefaz;
    /** ID de uma empresa real existente (FK em `sefaz_transmissions`). */
    companyId: string;
    certificateVaultRef: string;
    contingenciaSvc?: boolean;
  }): Promise<ProbeOutcome> {
    const cUF = UF_CODIGO[input.sampleUf];
    if (!cUF) {
      throw new Error(`UF ${input.sampleUf} sem código IBGE — corrigir mapeamento`);
    }
    const bodyXml = [
      '<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
      '<tpAmb>',
      input.ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2',
      '</tpAmb>',
      `<cUF>${cUF}</cUF>`,
      '<xServ>STATUS</xServ>',
      '</consStatServ>',
    ].join('');

    let cStat: string | null = null;
    let xMotivo: string | null = null;
    let latencyMs = 0;
    let probeFailed = false;
    try {
      const result = await this.soap.call({
        // companyId real é requerido pelo FK em sefaz_transmissions. O caller resolve
        // uma empresa ativa qualquer — NFeStatusServico4 é leitura e não exige relação
        // com o CNPJ do certificado.
        companyId: input.companyId,
        uf: input.sampleUf,
        ambiente: input.ambiente,
        service: 'NFeStatusServico4',
        bodyXml,
        certificateVaultRef: input.certificateVaultRef,
        contingenciaSvc: input.contingenciaSvc,
        timeoutMs: 10_000,
      });
      cStat = result.cStat ?? null;
      xMotivo = result.xMotivo ?? null;
      latencyMs = result.durationMs;
    } catch (err) {
      probeFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      xMotivo = msg.slice(0, 290);
      logger.warn(
        { err, autorizadora: input.autorizadora, ambiente: input.ambiente },
        'Probe SEFAZ falhou — registrando como falha',
      );
    }

    const current = await this.repo.find(input.autorizadora, input.ambiente);
    const next = this.applyTransition(current, {
      cStat,
      probeFailed,
      latencyMs,
    });

    const meanLatency = computeMeanLatency(current?.meanLatencyMs ?? null, latencyMs);

    await this.repo.upsert({
      autorizadora: input.autorizadora,
      ambiente: input.ambiente,
      state: next.state,
      stateSince: next.transitioned
        ? new Date()
        : current?.stateSince ?? new Date(),
      lastCheckAt: new Date(),
      lastCStat: cStat,
      lastXMotivo: xMotivo,
      meanLatencyMs: meanLatency,
      consecutiveFailures: next.consecutiveFailures,
      consecutiveSuccesses: next.consecutiveSuccesses,
    });

    return {
      autorizadora: input.autorizadora,
      ambiente: input.ambiente,
      state: next.state,
      cStat,
      xMotivo,
      latencyMs,
    };
  }

  /**
   * Varredura completa — usado pelo `SefazHealthCheckWorker`. Falhas individuais não
   * derrubam a varredura: cada autorizadora é tratada de forma independente.
   */
  async probeAll(input: {
    ambiente: AmbienteSefaz;
    companyId: string;
    certificateVaultRef: string;
  }): Promise<ProbeOutcome[]> {
    const outcomes: ProbeOutcome[] = [];
    for (const a of AUTORIDADES_CONHECIDAS) {
      try {
        const outcome = await this.probe({
          autorizadora: a.autorizadora,
          sampleUf: a.sampleUf,
          ambiente: input.ambiente,
          companyId: input.companyId,
          certificateVaultRef: input.certificateVaultRef,
          contingenciaSvc: a.contingenciaSvc,
        });
        outcomes.push(outcome);
      } catch (err) {
        logger.warn(
          { err, autorizadora: a.autorizadora },
          'Falha inesperada no probe — pulando autorizadora',
        );
      }
    }
    return outcomes;
  }

  /**
   * Lista pública para callers (ex.: worker) iterarem. Mantida exportada via método para
   * preservar encapsulamento — quem precisa conhecer a tabela é a infra de polling.
   */
  get autorizadoresConhecidas(): typeof AUTORIDADES_CONHECIDAS {
    return AUTORIDADES_CONHECIDAS;
  }

  /**
   * Máquina de estados — toma o estado atual + resultado da probe e decide o próximo.
   *
   * Regras:
   *  - cStat 107 + latency < LATENCY_DEGRADED_MS  → UP (após N sucessos consecutivos).
   *  - cStat 107 + latency >= LATENCY_DEGRADED_MS → DEGRADED (resposta lenta).
   *  - cStat 108/109/999 ou probe falhou → consecutiveFailures++, vira DOWN após N.
   *  - Outros cStat (rejeição genérica) → trata como falha.
   *
   * "DEGRADED" não conta como falha nem como sucesso para histerese — é estado terminal
   * até virar UP claro ou DOWN claro.
   */
  private applyTransition(
    current: SefazHealthStatus | null,
    probe: { cStat: string | null; probeFailed: boolean; latencyMs: number },
  ): {
    state: SefazHealthState;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    transitioned: boolean;
  } {
    const prevState = current?.state ?? SefazHealthState.UNKNOWN;
    const prevFailures = current?.consecutiveFailures ?? 0;
    const prevSuccesses = current?.consecutiveSuccesses ?? 0;

    const success = !probe.probeFailed && probe.cStat === '107';
    const explicitDown =
      probe.probeFailed || (probe.cStat !== null && ['108', '109', '999'].includes(probe.cStat));

    let consecutiveFailures = prevFailures;
    let consecutiveSuccesses = prevSuccesses;
    let state = prevState;

    if (success) {
      consecutiveFailures = 0;
      consecutiveSuccesses += 1;
      if (probe.latencyMs >= LATENCY_DEGRADED_MS) {
        state = SefazHealthState.DEGRADED;
      } else if (prevState === SefazHealthState.DOWN) {
        state =
          consecutiveSuccesses >= CONSECUTIVE_SUCCESSES_TO_UP
            ? SefazHealthState.UP
            : SefazHealthState.DOWN;
      } else {
        state = SefazHealthState.UP;
      }
    } else if (explicitDown) {
      consecutiveSuccesses = 0;
      consecutiveFailures += 1;
      state =
        consecutiveFailures >= CONSECUTIVE_FAILURES_TO_DOWN
          ? SefazHealthState.DOWN
          : prevState === SefazHealthState.UP
            ? SefazHealthState.DEGRADED
            : prevState;
    } else {
      // cStat ≠ 107 e ≠ 108/109/999: anomalia. Conta como falha leve para não mascarar.
      consecutiveSuccesses = 0;
      consecutiveFailures += 1;
      state = prevState === SefazHealthState.UP ? SefazHealthState.DEGRADED : prevState;
    }

    return {
      state,
      consecutiveFailures,
      consecutiveSuccesses,
      transitioned: state !== prevState,
    };
  }
}

/**
 * Média móvel simples sobre a latência. Mantém suavização sem precisar de janela
 * deslizante (banco precisaria de mais colunas) — boa o bastante para o dashboard.
 */
function computeMeanLatency(prev: number | null, current: number): number {
  if (current <= 0) return prev ?? 0;
  if (prev === null || prev === 0) return current;
  return Math.round(prev * 0.7 + current * 0.3);
}

import { Column, Entity, Index } from 'typeorm';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import { SefazHealthState } from '../../../domain/sefaz-health-enums';

/**
 * Estado de saúde por (autorizadora, ambiente). É a tabela que o `EmitirNFeUseCase`
 * consulta antes de transmitir para decidir se vai pela autorizadora normal ou pela
 * SVC. Atualizada exclusivamente pelo `SefazHealthCheckWorker` (cron a cada N minutos).
 *
 * O par único é (autorizadora, ambiente) porque homologação e produção podem estar em
 * estados diferentes — produção fora do ar não implica homologação fora, e vice-versa.
 */
@Entity('sefaz_health_status')
@Index('uq_sefaz_health_status_authority_env', ['autorizadora', 'ambiente'], { unique: true })
export class SefazHealthStatus extends BaseEntity {
  /** Identificador da autorizadora: SP, RS, MG, BA, AM, SVRS, SVAN, SVC-AN, SVC-RS. */
  @Column({ type: 'varchar', length: 10 })
  autorizadora!: string;

  @Column({ type: 'enum', enum: AmbienteSefaz })
  ambiente!: AmbienteSefaz;

  @Column({
    type: 'enum',
    enum: SefazHealthState,
    default: SefazHealthState.UNKNOWN,
  })
  state!: SefazHealthState;

  /** Quando o estado atual começou — útil para SLA e logs de "SEFAZ fora há X minutos". */
  @Column({ name: 'state_since', type: 'timestamptz', nullable: true })
  stateSince?: Date | null;

  @Column({ name: 'last_check_at', type: 'timestamptz', nullable: true })
  lastCheckAt?: Date | null;

  @Column({ name: 'last_c_stat', type: 'varchar', length: 10, nullable: true })
  lastCStat?: string | null;

  @Column({ name: 'last_x_motivo', type: 'varchar', length: 300, nullable: true })
  lastXMotivo?: string | null;

  /** Latência média (ms) das últimas N probes — exibida no dashboard. */
  @Column({ name: 'mean_latency_ms', type: 'int', nullable: true })
  meanLatencyMs?: number | null;

  /** Contador de falhas seguidas. Resetado a cada probe com cStat 107. */
  @Column({ name: 'consecutive_failures', type: 'int', default: 0 })
  consecutiveFailures!: number;

  /** Contador de sucessos seguidos. Resetado a cada probe que NÃO retorna cStat 107. */
  @Column({ name: 'consecutive_successes', type: 'int', default: 0 })
  consecutiveSuccesses!: number;
}

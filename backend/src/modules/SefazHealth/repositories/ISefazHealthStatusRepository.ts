import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';

import { SefazHealthState } from '../domain/sefaz-health-enums';
import { SefazHealthStatus } from '../infra/typeorm/entities/SefazHealthStatus';

export interface UpsertSefazHealthData {
  autorizadora: string;
  ambiente: AmbienteSefaz;
  state: SefazHealthState;
  stateSince: Date;
  lastCheckAt: Date;
  lastCStat: string | null;
  lastXMotivo: string | null;
  meanLatencyMs: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface ISefazHealthStatusRepository {
  /** Lê o estado atual (ou null se nunca foi probed). */
  find(autorizadora: string, ambiente: AmbienteSefaz): Promise<SefazHealthStatus | null>;

  /** Lista todos os estados conhecidos para o dashboard. */
  list(): Promise<SefazHealthStatus[]>;

  /** Cria ou substitui o registro do par (autorizadora, ambiente). */
  upsert(data: UpsertSefazHealthData): Promise<SefazHealthStatus>;
}

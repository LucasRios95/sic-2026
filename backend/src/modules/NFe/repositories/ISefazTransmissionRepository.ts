import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';

import { SefazTransmission } from '../infra/typeorm/entities/SefazTransmission';

export interface CreateSefazTransmissionData {
  companyId: string;
  nfeId?: string | null;
  uf: string;
  ambiente: AmbienteSefaz;
  servico: string;
  requestXml?: string | null;
  responseXml?: string | null;
  httpStatus?: number | null;
  cStat?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
}

export interface ISefazTransmissionRepository {
  create(data: CreateSefazTransmissionData): Promise<SefazTransmission>;
  listByNFe(companyId: string, nfeId: string): Promise<SefazTransmission[]>;
}

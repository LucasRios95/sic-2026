import { DocumentStatus } from '@modules/NFe/domain/nfe-enums';

import { TipoManifestacao } from '../domain/nfe-recepcao-enums';
import { DfeManifestation } from '../infra/typeorm/entities/DfeManifestation';

export interface CreateManifestationData {
  receivedDocumentId: string;
  tipo: TipoManifestacao;
  dhEvento: Date;
  justificativa?: string | null;
  createdBy?: string | null;
}

export interface UpdateManifestationData {
  status?: DocumentStatus;
  protocolo?: string | null;
  cStat?: string | null;
  xMotivo?: string | null;
  enviadoEm?: Date | null;
  retornoXml?: string | null;
}

export interface IDfeManifestationRepository {
  create(data: CreateManifestationData): Promise<DfeManifestation>;
  update(id: string, patch: UpdateManifestationData): Promise<DfeManifestation>;
  listByDocument(receivedDocumentId: string): Promise<DfeManifestation[]>;
}

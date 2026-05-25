import { NFeEvento } from '../infra/typeorm/entities/NFeEvento';
import { DocumentStatus, TipoEventoNFe } from '../domain/nfe-enums';

export interface CreateNFeEventoData {
  nfeId: string;
  tipoEvento: TipoEventoNFe;
  sequencial?: number;
  dhEvento: Date;
  justificativa?: string | null;
  detalhe?: unknown;
  xmlEvento?: string | null;
  createdBy?: string | null;
}

export interface UpdateNFeEventoData {
  status?: DocumentStatus;
  protocolo?: string | null;
  cStat?: string | null;
  xMotivo?: string | null;
  xmlRetorno?: string | null;
}

export interface INFeEventoRepository {
  create(data: CreateNFeEventoData): Promise<NFeEvento>;
  update(id: string, patch: UpdateNFeEventoData): Promise<NFeEvento>;
  countByTipo(nfeId: string, tipo: TipoEventoNFe): Promise<number>;
  listByNFe(nfeId: string): Promise<NFeEvento[]>;
}

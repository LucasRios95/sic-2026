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
  /**
   * Grava o evento reaproveitando a linha já existente em (nfeId, tipoEvento, sequencial)
   * quando houver — reseta o estado de retorno da SEFAZ para uma nova tentativa. Evita a
   * violação do índice único `uq_nfe_eventos_scope` ao retransmitir um evento (ex.: um
   * cancelamento que a SEFAZ rejeitou e o usuário tenta de novo).
   */
  createOrReplace(data: CreateNFeEventoData): Promise<NFeEvento>;
  update(id: string, patch: UpdateNFeEventoData): Promise<NFeEvento>;
  countByTipo(nfeId: string, tipo: TipoEventoNFe): Promise<number>;
  listByNFe(nfeId: string): Promise<NFeEvento[]>;
}

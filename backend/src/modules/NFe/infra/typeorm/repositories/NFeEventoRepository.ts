import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { DocumentStatus, TipoEventoNFe } from '../../../domain/nfe-enums';
import {
  CreateNFeEventoData,
  INFeEventoRepository,
  UpdateNFeEventoData,
} from '../../../repositories/INFeEventoRepository';
import { NFeEvento } from '../entities/NFeEvento';

export class NFeEventoRepository implements INFeEventoRepository {
  private readonly repo: Repository<NFeEvento>;

  constructor() {
    this.repo = appDataSource.getRepository(NFeEvento);
  }

  async create(data: CreateNFeEventoData): Promise<NFeEvento> {
    const entity = this.repo.create({ ...data, sequencial: data.sequencial ?? 1 });
    return this.repo.save(entity);
  }

  async createOrReplace(data: CreateNFeEventoData): Promise<NFeEvento> {
    const sequencial = data.sequencial ?? 1;
    const existing = await this.repo.findOne({
      where: { nfeId: data.nfeId, tipoEvento: data.tipoEvento, sequencial },
    });
    if (!existing) {
      const entity = this.repo.create({ ...data, sequencial });
      return this.repo.save(entity);
    }
    // Reaproveita a linha do evento anterior (ex.: cancelamento rejeitado pela SEFAZ):
    // reseta o retorno da SEFAZ para uma nova tentativa. Sem isso, a retransmissão viola o
    // índice único uq_nfe_eventos_scope e derruba a requisição com erro 500.
    existing.dhEvento = data.dhEvento;
    existing.justificativa = data.justificativa ?? null;
    existing.detalhe = data.detalhe ?? null;
    existing.xmlEvento = data.xmlEvento ?? null;
    existing.createdBy = data.createdBy ?? existing.createdBy ?? null;
    existing.status = DocumentStatus.PENDING;
    existing.protocolo = null;
    existing.cStat = null;
    existing.xMotivo = null;
    existing.xmlRetorno = null;
    return this.repo.save(existing);
  }

  async update(id: string, patch: UpdateNFeEventoData): Promise<NFeEvento> {
    await this.repo.update({ id }, patch);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new Error(`NFeEvento ${id} desapareceu durante update`);
    return updated;
  }

  async countByTipo(nfeId: string, tipo: TipoEventoNFe): Promise<number> {
    return this.repo.count({ where: { nfeId, tipoEvento: tipo } });
  }

  async listByNFe(nfeId: string): Promise<NFeEvento[]> {
    return this.repo.find({ where: { nfeId }, order: { dhEvento: 'ASC' } });
  }
}

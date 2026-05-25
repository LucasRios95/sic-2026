import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { TipoEventoNFe } from '../../../domain/nfe-enums';
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

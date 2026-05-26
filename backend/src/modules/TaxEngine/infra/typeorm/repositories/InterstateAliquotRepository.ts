import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IInterstateAliquotRepository } from '../../../repositories/IInterstateAliquotRepository';
import { InterstateAliquot } from '../entities/InterstateAliquot';

export class InterstateAliquotRepository implements IInterstateAliquotRepository {
  private readonly repo: Repository<InterstateAliquot>;

  constructor() {
    this.repo = appDataSource.getRepository(InterstateAliquot);
  }

  async findActiveAt(
    ufOrigem: string,
    ufDestino: string,
    at: Date,
  ): Promise<InterstateAliquot | null> {
    // Janela aberta (caso comum, com índice parcial cobrindo o caminho).
    const open = await this.repo.findOne({
      where: { ufOrigem, ufDestino, validFrom: LessThanOrEqual(at), validTo: IsNull() },
      order: { validFrom: 'DESC' },
    });
    if (open) return open;
    return this.repo.findOne({
      where: {
        ufOrigem,
        ufDestino,
        validFrom: LessThanOrEqual(at),
        validTo: MoreThan(at),
      },
      order: { validFrom: 'DESC' },
    });
  }

  async upsert(data: Omit<InterstateAliquot, 'id' | 'createdAt' | 'updatedAt'>) {
    const existing = await this.repo.findOne({
      where: {
        ufOrigem: data.ufOrigem,
        ufDestino: data.ufDestino,
        validFrom: data.validFrom,
      },
    });
    if (existing) {
      await this.repo.update({ id: existing.id }, data);
      return (await this.repo.findOne({ where: { id: existing.id } }))!;
    }
    const created = this.repo.create(data);
    return this.repo.save(created);
  }

  async listAll(): Promise<InterstateAliquot[]> {
    return this.repo.find({ order: { ufOrigem: 'ASC', ufDestino: 'ASC' } });
  }
}

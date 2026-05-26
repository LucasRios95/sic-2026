import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IIcmsStMvaRepository } from '../../../repositories/IIcmsStMvaRepository';
import { IcmsStMva } from '../entities/IcmsStMva';

export class IcmsStMvaRepository implements IIcmsStMvaRepository {
  private readonly repo: Repository<IcmsStMva>;

  constructor() {
    this.repo = appDataSource.getRepository(IcmsStMva);
  }

  async findActiveAt(
    ufOrigem: string,
    ufDestino: string,
    ncm: string,
    at: Date,
  ): Promise<IcmsStMva | null> {
    const open = await this.repo.findOne({
      where: { ufOrigem, ufDestino, ncm, validFrom: LessThanOrEqual(at), validTo: IsNull() },
      order: { validFrom: 'DESC' },
    });
    if (open) return open;
    return this.repo.findOne({
      where: { ufOrigem, ufDestino, ncm, validFrom: LessThanOrEqual(at), validTo: MoreThan(at) },
      order: { validFrom: 'DESC' },
    });
  }

  async upsert(data: Omit<IcmsStMva, 'id' | 'createdAt' | 'updatedAt'>) {
    const existing = await this.repo.findOne({
      where: {
        ufOrigem: data.ufOrigem,
        ufDestino: data.ufDestino,
        ncm: data.ncm,
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

  async listAll(): Promise<IcmsStMva[]> {
    return this.repo.find({
      order: { ufOrigem: 'ASC', ufDestino: 'ASC', ncm: 'ASC' },
      take: 1000,
    });
  }
}

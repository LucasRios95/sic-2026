import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IIcmsInternaUfRepository } from '../../../repositories/IIcmsInternaUfRepository';
import { IcmsInternaUf } from '../entities/IcmsInternaUf';

export class IcmsInternaUfRepository implements IIcmsInternaUfRepository {
  private readonly repo: Repository<IcmsInternaUf>;

  constructor() {
    this.repo = appDataSource.getRepository(IcmsInternaUf);
  }

  async findActiveAt(uf: string, at: Date): Promise<IcmsInternaUf | null> {
    const open = await this.repo.findOne({
      where: { uf, validFrom: LessThanOrEqual(at), validTo: IsNull() },
      order: { validFrom: 'DESC' },
    });
    if (open) return open;
    return this.repo.findOne({
      where: { uf, validFrom: LessThanOrEqual(at), validTo: MoreThan(at) },
      order: { validFrom: 'DESC' },
    });
  }

  async upsert(data: Omit<IcmsInternaUf, 'id' | 'createdAt' | 'updatedAt'>) {
    const existing = await this.repo.findOne({
      where: { uf: data.uf, validFrom: data.validFrom },
    });
    if (existing) {
      await this.repo.update({ id: existing.id }, data);
      return (await this.repo.findOne({ where: { id: existing.id } }))!;
    }
    const created = this.repo.create(data);
    return this.repo.save(created);
  }
}

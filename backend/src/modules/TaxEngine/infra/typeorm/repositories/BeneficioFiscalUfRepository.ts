import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IBeneficioFiscalUfRepository } from '../../../repositories/IBeneficioFiscalUfRepository';
import { BeneficioFiscalUf } from '../entities/BeneficioFiscalUf';

export class BeneficioFiscalUfRepository implements IBeneficioFiscalUfRepository {
  private readonly repo: Repository<BeneficioFiscalUf>;

  constructor() {
    this.repo = appDataSource.getRepository(BeneficioFiscalUf);
  }

  async findActiveAt(
    uf: string,
    ncm: string | null,
    at: Date,
  ): Promise<BeneficioFiscalUf | null> {
    // Preferência por específico (ncm = X) antes do genérico (ncm IS NULL).
    if (ncm) {
      const specific =
        (await this.repo.findOne({
          where: { uf, ncm, validFrom: LessThanOrEqual(at), validTo: IsNull() },
          order: { validFrom: 'DESC' },
        })) ??
        (await this.repo.findOne({
          where: { uf, ncm, validFrom: LessThanOrEqual(at), validTo: MoreThan(at) },
          order: { validFrom: 'DESC' },
        }));
      if (specific) return specific;
    }

    const generic =
      (await this.repo.findOne({
        where: { uf, ncm: IsNull(), validFrom: LessThanOrEqual(at), validTo: IsNull() },
        order: { validFrom: 'DESC' },
      })) ??
      (await this.repo.findOne({
        where: { uf, ncm: IsNull(), validFrom: LessThanOrEqual(at), validTo: MoreThan(at) },
        order: { validFrom: 'DESC' },
      }));
    return generic;
  }

  async upsert(data: Omit<BeneficioFiscalUf, 'id' | 'createdAt' | 'updatedAt'>) {
    const where = {
      uf: data.uf,
      ncm: data.ncm ?? IsNull(),
      codBeneficio: data.codBeneficio,
      validFrom: data.validFrom,
    };
    const existing = await this.repo.findOne({ where });
    if (existing) {
      await this.repo.update({ id: existing.id }, data);
      return (await this.repo.findOne({ where: { id: existing.id } }))!;
    }
    const created = this.repo.create(data);
    return this.repo.save(created);
  }
}

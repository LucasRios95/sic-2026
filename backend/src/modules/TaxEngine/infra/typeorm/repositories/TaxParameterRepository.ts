import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { ITaxParameterRepository } from '../../../repositories/ITaxParameterRepository';
import { TaxParameter } from '../entities/TaxParameter';

export class TaxParameterRepository implements ITaxParameterRepository {
  private readonly repo: Repository<TaxParameter>;

  constructor() {
    this.repo = appDataSource.getRepository(TaxParameter);
  }

  async findActiveAt(
    chave: string,
    companyId: string | null,
    at: Date,
  ): Promise<TaxParameter | null> {
    // Empresa-específico (precedência alta).
    if (companyId) {
      const company =
        (await this.repo.findOne({
          where: { companyId, chave, validFrom: LessThanOrEqual(at), validTo: IsNull() },
          order: { validFrom: 'DESC' },
        })) ??
        (await this.repo.findOne({
          where: { companyId, chave, validFrom: LessThanOrEqual(at), validTo: MoreThan(at) },
          order: { validFrom: 'DESC' },
        }));
      if (company) return company;
    }

    const global =
      (await this.repo.findOne({
        where: { companyId: IsNull(), chave, validFrom: LessThanOrEqual(at), validTo: IsNull() },
        order: { validFrom: 'DESC' },
      })) ??
      (await this.repo.findOne({
        where: { companyId: IsNull(), chave, validFrom: LessThanOrEqual(at), validTo: MoreThan(at) },
        order: { validFrom: 'DESC' },
      }));
    return global;
  }

  async upsert(data: Omit<TaxParameter, 'id' | 'createdAt' | 'updatedAt' | 'company'>) {
    // Aproveitamos a unique constraint COALESCE(company_id, 0...0)/chave/valid_from da migration.
    const existing = await this.repo
      .createQueryBuilder('tp')
      .where('COALESCE(tp.company_id, :sentinel) = COALESCE(:companyId, :sentinel)', {
        sentinel: '00000000-0000-0000-0000-000000000000',
        companyId: data.companyId ?? null,
      })
      .andWhere('tp.chave = :chave', { chave: data.chave })
      .andWhere('tp.valid_from = :validFrom', { validFrom: data.validFrom })
      .getOne();

    if (existing) {
      await this.repo.update({ id: existing.id }, data);
      return (await this.repo.findOne({ where: { id: existing.id } }))!;
    }
    const created = this.repo.create(data);
    return this.repo.save(created);
  }
}

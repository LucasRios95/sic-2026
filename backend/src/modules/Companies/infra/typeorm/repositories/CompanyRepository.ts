import { In, IsNull, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { ICreateCompanyDTO } from '../../../dtos/ICreateCompanyDTO';
import {
  ICompanyRepository,
  IUpdateCompanyDTO,
} from '../../../repositories/ICompanyRepository';
import { Company } from '../entities/Company';

export class CompanyRepository implements ICompanyRepository {
  private readonly repo: Repository<Company>;

  constructor() {
    this.repo = appDataSource.getRepository(Company);
  }

  async create(data: ICreateCompanyDTO): Promise<Company> {
    const company = this.repo.create(data);
    return this.repo.save(company);
  }

  async update(id: string, data: IUpdateCompanyDTO): Promise<Company> {
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!updated) {
      throw new Error(`Company ${id} desapareceu durante o update`);
    }
    return updated;
  }

  async findById(id: string): Promise<Company | null> {
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  async findByCnpj(cnpj: string): Promise<Company | null> {
    return this.repo.findOne({ where: { cnpj, deletedAt: IsNull() } });
  }

  async findByIds(ids: string[]): Promise<Company[]> {
    if (ids.length === 0) return [];
    return this.repo.find({ where: { id: In(ids), deletedAt: IsNull() } });
  }

  async listByTenant(tenantId: string): Promise<Company[]> {
    return this.repo.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { razaoSocial: 'ASC' },
    });
  }
}

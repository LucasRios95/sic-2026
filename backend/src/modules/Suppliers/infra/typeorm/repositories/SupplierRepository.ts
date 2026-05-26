import { Brackets, IsNull, Repository } from 'typeorm';

import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  ICreateSupplierDTO,
  IListSuppliersFilter,
  IUpdateSupplierDTO,
} from '../../../dtos/SupplierDTOs';
import { ISupplierRepository } from '../../../repositories/ISupplierRepository';
import { Supplier } from '../entities/Supplier';

export class SupplierRepository implements ISupplierRepository {
  private readonly repo: Repository<Supplier>;

  constructor() {
    this.repo = appDataSource.getRepository(Supplier);
  }

  async create(data: ICreateSupplierDTO): Promise<Supplier> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: IUpdateSupplierDTO): Promise<Supplier> {
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new Error(`Supplier ${id} desapareceu durante o update`);
    return updated;
  }

  async findById(companyId: string, id: string): Promise<Supplier | null> {
    return this.repo.findOne({ where: { id, companyId, deletedAt: IsNull() } });
  }

  async findByCnpjCpf(companyId: string, cnpjCpf: string): Promise<Supplier | null> {
    return this.repo.findOne({ where: { companyId, cnpjCpf, deletedAt: IsNull() } });
  }

  async list(filter: IListSuppliersFilter): Promise<ListResult<Supplier>> {
    const { companyId, search, active, limit = 50, offset = 0 } = filter;

    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.deleted_at IS NULL');

    if (active !== undefined) qb.andWhere('s.active = :active', { active });
    if (search) {
      // Idem CustomerRepository: usa f_unaccent + índice trgm e protege contra
      // o caso de search sem dígitos virar '%%' no CNPJ/CPF.
      const rawDigits = search.replace(/\D/g, '');
      qb.andWhere(
        new Brackets((b) => {
          b.where(
            `f_unaccent(lower(s.nome_razao)) LIKE f_unaccent(lower(:term))`,
            { term: `%${search}%` },
          );
          if (rawDigits.length > 0) {
            b.orWhere('s.cnpj_cpf LIKE :rawTerm', { rawTerm: `%${rawDigits}%` });
          }
        }),
      );
    }

    qb.orderBy('s.nome_razao', 'ASC').limit(limit).offset(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async softDelete(companyId: string, id: string): Promise<void> {
    await this.repo.update({ id, companyId }, { deletedAt: new Date() });
  }
}

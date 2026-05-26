import { Brackets, IsNull, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  ICreateCustomerDTO,
  IListCustomersFilter,
  IUpdateCustomerDTO,
} from '../../../dtos/CustomerDTOs';
import { ICustomerRepository, ListResult } from '../../../repositories/ICustomerRepository';
import { Customer } from '../entities/Customer';

export class CustomerRepository implements ICustomerRepository {
  private readonly repo: Repository<Customer>;

  constructor() {
    this.repo = appDataSource.getRepository(Customer);
  }

  async create(data: ICreateCustomerDTO): Promise<Customer> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: IUpdateCustomerDTO): Promise<Customer> {
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) {
      // Caller já garantiu a existência; chegar aqui significa estado inconsistente.
      throw new Error(`Customer ${id} desapareceu durante o update`);
    }
    return updated;
  }

  async findById(companyId: string, id: string): Promise<Customer | null> {
    return this.repo.findOne({ where: { id, companyId, deletedAt: IsNull() } });
  }

  async findByCnpjCpf(companyId: string, cnpjCpf: string): Promise<Customer | null> {
    return this.repo.findOne({ where: { companyId, cnpjCpf, deletedAt: IsNull() } });
  }

  async list(filter: IListCustomersFilter): Promise<ListResult<Customer>> {
    const { companyId, search, active, limit = 50, offset = 0 } = filter;

    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId })
      .andWhere('c.deleted_at IS NULL');

    if (active !== undefined) qb.andWhere('c.active = :active', { active });
    if (search) {
      // Busca insensível a acentos via f_unaccent(lower(...)). Casamento pela mesma
      // expressão dos índices GIN trigram (idx_customers_nome_razao_trgm),
      // permitindo index scan mesmo em padrões `%termo%`. O CNPJ/CPF é puro dígito,
      // então um trgm comum basta.
      // O OR no documento só entra quando o termo tem dígitos — caso contrário
      // ILIKE '%%' casaria com tudo, anulando o filtro por nome.
      const rawDigits = search.replace(/\D/g, '');
      qb.andWhere(
        new Brackets((b) => {
          b.where(
            `f_unaccent(lower(c.nome_razao)) LIKE f_unaccent(lower(:term))`,
            { term: `%${search}%` },
          );
          if (rawDigits.length > 0) {
            b.orWhere('c.cnpj_cpf LIKE :rawTerm', { rawTerm: `%${rawDigits}%` });
          }
        }),
      );
    }

    qb.orderBy('c.nome_razao', 'ASC').limit(limit).offset(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async softDelete(companyId: string, id: string): Promise<void> {
    await this.repo.update({ id, companyId }, { deletedAt: new Date() });
  }
}

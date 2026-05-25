import { Brackets, IsNull, Repository } from 'typeorm';

import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IListProductsFilter, IUpdateProductDTO } from '../../../dtos/ProductDTOs';
import {
  CreateProductData,
  IProductRepository,
} from '../../../repositories/IProductRepository';
import { Product } from '../entities/Product';

export class ProductRepository implements IProductRepository {
  private readonly repo: Repository<Product>;

  constructor() {
    this.repo = appDataSource.getRepository(Product);
  }

  async create(data: CreateProductData): Promise<Product> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: IUpdateProductDTO): Promise<Product> {
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new Error(`Product ${id} desapareceu durante o update`);
    return updated;
  }

  async findById(companyId: string, id: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id, companyId, deletedAt: IsNull() } });
  }

  async findByCodigo(companyId: string, codigo: string): Promise<Product | null> {
    return this.repo.findOne({ where: { companyId, codigo, deletedAt: IsNull() } });
  }

  async list(filter: IListProductsFilter): Promise<ListResult<Product>> {
    const { companyId, search, ncm, active, limit = 50, offset = 0 } = filter;

    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId })
      .andWhere('p.deleted_at IS NULL');

    if (active !== undefined) qb.andWhere('p.active = :active', { active });
    if (ncm) qb.andWhere('p.ncm = :ncm', { ncm });
    if (search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('p.descricao ILIKE :term', { term: `%${search}%` })
            .orWhere('p.codigo ILIKE :term', { term: `%${search}%` })
            .orWhere('p.codigo_barras = :exact', { exact: search });
        }),
      );
    }

    qb.orderBy('p.descricao', 'ASC').limit(limit).offset(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async softDelete(companyId: string, id: string): Promise<void> {
    await this.repo.update({ id, companyId }, { deletedAt: new Date() });
  }
}

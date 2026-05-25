import { Brackets, IsNull, Repository } from 'typeorm';

import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import { IListServicesFilter, IUpdateServiceDTO } from '../../../dtos/ServiceDTOs';
import {
  CreateServiceData,
  IServiceRepository,
} from '../../../repositories/IServiceRepository';
import { Service } from '../entities/Service';

export class ServiceRepository implements IServiceRepository {
  private readonly repo: Repository<Service>;

  constructor() {
    this.repo = appDataSource.getRepository(Service);
  }

  async create(data: CreateServiceData): Promise<Service> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: IUpdateServiceDTO): Promise<Service> {
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new Error(`Service ${id} desapareceu durante o update`);
    return updated;
  }

  async findById(companyId: string, id: string): Promise<Service | null> {
    return this.repo.findOne({ where: { id, companyId, deletedAt: IsNull() } });
  }

  async findByCodigo(companyId: string, codigo: string): Promise<Service | null> {
    return this.repo.findOne({ where: { companyId, codigo, deletedAt: IsNull() } });
  }

  async list(filter: IListServicesFilter): Promise<ListResult<Service>> {
    const { companyId, search, itemListaServico, active, limit = 50, offset = 0 } = filter;

    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.deleted_at IS NULL');

    if (active !== undefined) qb.andWhere('s.active = :active', { active });
    if (itemListaServico) qb.andWhere('s.item_lista_servico = :item', { item: itemListaServico });
    if (search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('s.descricao ILIKE :term', { term: `%${search}%` }).orWhere(
            's.codigo ILIKE :term',
            { term: `%${search}%` },
          );
        }),
      );
    }

    qb.orderBy('s.descricao', 'ASC').limit(limit).offset(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async softDelete(companyId: string, id: string): Promise<void> {
    await this.repo.update({ id, companyId }, { deletedAt: new Date() });
  }
}

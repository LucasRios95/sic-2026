import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateServiceTaxRuleData,
  IServiceTaxRuleRepository,
} from '../../../repositories/IServiceTaxRuleRepository';
import { ServiceTaxRule } from '../entities/ServiceTaxRule';

export class ServiceTaxRuleRepository implements IServiceTaxRuleRepository {
  private readonly repo: Repository<ServiceTaxRule>;

  constructor() {
    this.repo = appDataSource.getRepository(ServiceTaxRule);
  }

  async create(data: CreateServiceTaxRuleData): Promise<ServiceTaxRule> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async listByService(serviceId: string): Promise<ServiceTaxRule[]> {
    return this.repo.find({ where: { serviceId }, order: { validFrom: 'ASC' } });
  }

  async findActiveAt(serviceId: string, date: Date): Promise<ServiceTaxRule | null> {
    const open = await this.repo.findOne({
      where: { serviceId, validFrom: LessThanOrEqual(date), validTo: IsNull() },
      order: { validFrom: 'DESC' },
    });
    if (open) return open;
    return this.repo.findOne({
      where: { serviceId, validFrom: LessThanOrEqual(date), validTo: MoreThan(date) },
      order: { validFrom: 'DESC' },
    });
  }
}

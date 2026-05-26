import { Repository } from 'typeorm';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  ISefazHealthStatusRepository,
  UpsertSefazHealthData,
} from '../../../repositories/ISefazHealthStatusRepository';
import { SefazHealthStatus } from '../entities/SefazHealthStatus';

export class SefazHealthStatusRepository implements ISefazHealthStatusRepository {
  private readonly repo: Repository<SefazHealthStatus>;

  constructor() {
    this.repo = appDataSource.getRepository(SefazHealthStatus);
  }

  async find(
    autorizadora: string,
    ambiente: AmbienteSefaz,
  ): Promise<SefazHealthStatus | null> {
    return this.repo.findOne({ where: { autorizadora, ambiente } });
  }

  async list(): Promise<SefazHealthStatus[]> {
    return this.repo.find({ order: { autorizadora: 'ASC', ambiente: 'ASC' } });
  }

  async upsert(data: UpsertSefazHealthData): Promise<SefazHealthStatus> {
    const existing = await this.find(data.autorizadora, data.ambiente);
    if (existing) {
      Object.assign(existing, data);
      return this.repo.save(existing);
    }
    const created = this.repo.create(data);
    return this.repo.save(created);
  }
}

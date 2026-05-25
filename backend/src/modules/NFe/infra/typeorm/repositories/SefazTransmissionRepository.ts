import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateSefazTransmissionData,
  ISefazTransmissionRepository,
} from '../../../repositories/ISefazTransmissionRepository';
import { SefazTransmission } from '../entities/SefazTransmission';

export class SefazTransmissionRepository implements ISefazTransmissionRepository {
  private readonly repo: Repository<SefazTransmission>;

  constructor() {
    this.repo = appDataSource.getRepository(SefazTransmission);
  }

  async create(data: CreateSefazTransmissionData): Promise<SefazTransmission> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async listByNFe(companyId: string, nfeId: string): Promise<SefazTransmission[]> {
    return this.repo.find({
      where: { companyId, nfeId },
      order: { createdAt: 'ASC' },
    });
  }
}

import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateManifestationData,
  IDfeManifestationRepository,
  UpdateManifestationData,
} from '../../../repositories/IDfeManifestationRepository';
import { DfeManifestation } from '../entities/DfeManifestation';

export class DfeManifestationRepository implements IDfeManifestationRepository {
  private readonly repo: Repository<DfeManifestation>;

  constructor() {
    this.repo = appDataSource.getRepository(DfeManifestation);
  }

  async create(data: CreateManifestationData): Promise<DfeManifestation> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, patch: UpdateManifestationData): Promise<DfeManifestation> {
    await this.repo.update({ id }, patch);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new Error(`DfeManifestation ${id} desapareceu`);
    return updated;
  }

  async listByDocument(receivedDocumentId: string): Promise<DfeManifestation[]> {
    return this.repo.find({
      where: { receivedDocumentId },
      order: { dhEvento: 'ASC' },
    });
  }
}

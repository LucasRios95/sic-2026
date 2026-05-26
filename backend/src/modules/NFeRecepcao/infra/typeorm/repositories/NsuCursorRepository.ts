import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { INsuCursorRepository } from '../../../repositories/INsuCursorRepository';
import { NsuCursor } from '../entities/NsuCursor';

export class NsuCursorRepository implements INsuCursorRepository {
  private readonly repo: Repository<NsuCursor>;

  constructor() {
    this.repo = appDataSource.getRepository(NsuCursor);
  }

  async findOrCreate(companyId: string, origem: string): Promise<NsuCursor> {
    const existing = await this.repo.findOne({ where: { companyId, origem } });
    if (existing) return existing;
    const created = this.repo.create({
      companyId,
      origem,
      cursorValue: '0',
    });
    return this.repo.save(created);
  }

  async advance(id: string, newValue: string, lastCStat: string | null): Promise<void> {
    await this.repo.update(
      { id },
      {
        cursorValue: newValue,
        lastCStat,
        lastFetchedAt: new Date(),
      },
    );
  }
}

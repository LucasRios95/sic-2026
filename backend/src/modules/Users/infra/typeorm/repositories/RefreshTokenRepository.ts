import { IsNull, MoreThan, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateRefreshTokenData,
  IRefreshTokenRepository,
} from '../../../repositories/IRefreshTokenRepository';
import { RefreshToken } from '../entities/RefreshToken';

export class RefreshTokenRepository implements IRefreshTokenRepository {
  private readonly repo: Repository<RefreshToken>;

  constructor() {
    this.repo = appDataSource.getRepository(RefreshToken);
  }

  async create(data: CreateRefreshTokenData): Promise<RefreshToken> {
    const token = this.repo.create(data);
    return this.repo.save(token);
  }

  async findActiveByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.repo.findOne({
      where: { tokenHash, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.repo.update({ id }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}

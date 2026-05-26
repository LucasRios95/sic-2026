import { Between, IsNull, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateCertificateData,
  ICertificateRepository,
} from '../../../repositories/ICertificateRepository';
import { Certificate } from '../entities/Certificate';

export class CertificateRepository implements ICertificateRepository {
  private readonly repo: Repository<Certificate>;

  constructor() {
    this.repo = appDataSource.getRepository(Certificate);
  }

  async create(data: CreateCertificateData): Promise<Certificate> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(companyId: string, id: string): Promise<Certificate | null> {
    return this.repo.findOne({ where: { id, companyId } });
  }

  async findByThumbprint(thumbprint: string): Promise<Certificate | null> {
    return this.repo.findOne({ where: { thumbprint } });
  }

  /**
   * Critério de escolha do certificado para emissão:
   *  - Ativo (`active = true`).
   *  - Não revogado (`revoked_at IS NULL`).
   *  - Dentro da janela de validade (`valid_from <= now <= valid_to`).
   *  - Em caso de empate, prefere o que vai expirar mais tarde — assim, quando há
   *    renovação cadastrada antes do antigo expirar, o motor já usa o novo.
   */
  async findActiveForCompany(companyId: string): Promise<Certificate | null> {
    return this.repo
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId })
      .andWhere('c.active = true')
      .andWhere('c.revoked_at IS NULL')
      .andWhere('c.valid_from <= now()')
      .andWhere('c.valid_to >= now()')
      .orderBy('c.valid_to', 'DESC')
      .getOne();
  }

  async findFirstActive(): Promise<Certificate | null> {
    return this.repo
      .createQueryBuilder('c')
      .where('c.active = true')
      .andWhere('c.revoked_at IS NULL')
      .andWhere('c.valid_from <= now()')
      .andWhere('c.valid_to >= now()')
      .orderBy('c.valid_to', 'DESC')
      .limit(1)
      .getOne();
  }

  async listByCompany(companyId: string): Promise<Certificate[]> {
    return this.repo.find({
      where: { companyId },
      order: { validTo: 'DESC' },
    });
  }

  async listExpiring(daysAhead: number): Promise<Certificate[]> {
    const now = new Date();
    const limit = new Date(now.getTime() + daysAhead * 24 * 3600_000);
    return this.repo.find({
      where: {
        active: true,
        revokedAt: IsNull(),
        validTo: Between(now, limit),
      },
      order: { validTo: 'ASC' },
    });
  }

  async revoke(id: string, revokedBy: string): Promise<void> {
    await this.repo.update(
      { id },
      { active: false, revokedAt: new Date(), revokedBy },
    );
  }
}

import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateNFeData,
  CreateNFeItemData,
  CreateNFePagamentoData,
  INFeRepository,
  ListNFesFilter,
} from '../../../repositories/INFeRepository';
import { NFe } from '../entities/NFe';
import { NFeItem } from '../entities/NFeItem';
import { NFePagamento } from '../entities/NFePagamento';

export class NFeRepository implements INFeRepository {
  private readonly repo: Repository<NFe>;

  constructor() {
    this.repo = appDataSource.getRepository(NFe);
  }

  async findByIdempotencyKey(key: string): Promise<NFe | null> {
    return this.repo.findOne({ where: { idempotencyKey: key } });
  }

  async findById(companyId: string, id: string): Promise<NFe | null> {
    return this.repo.findOne({ where: { id, companyId } });
  }

  async findByIdAny(id: string): Promise<NFe | null> {
    return this.repo.findOne({ where: { id } });
  }

  async listStaleProcessing(minIdleMinutes: number, limit: number): Promise<NFe[]> {
    // updatedAt como aproximação do tempo desde a última transição de status. Quando o
    // EmitirNFeUseCase atualiza para PROCESSING após timeout, esse updatedAt é o sinal.
    const cutoff = new Date(Date.now() - minIdleMinutes * 60_000);
    return this.repo
      .createQueryBuilder('n')
      .where('n.status = :status', { status: 'PROCESSING' })
      .andWhere('n.updated_at <= :cutoff', { cutoff })
      .orderBy('n.updated_at', 'ASC')
      .limit(limit)
      .getMany();
  }

  async findByIdWithRelations(companyId: string, id: string): Promise<NFe | null> {
    return this.repo.findOne({
      where: { id, companyId },
      relations: ['items', 'pagamentos', 'eventos'],
    });
  }

  async createAggregate(
    nfeData: CreateNFeData,
    items: CreateNFeItemData[],
    pagamentos: CreateNFePagamentoData[],
  ): Promise<NFe> {
    // Transação garante atomicidade — se um item falhar, nada persiste.
    return appDataSource.transaction(async (manager) => {
      const nfe = manager.create(NFe, nfeData);
      const saved = await manager.save(nfe);

      const itemEntities = items.map((it) =>
        manager.create(NFeItem, { ...it, nfeId: saved.id }),
      );
      await manager.save(NFeItem, itemEntities);

      const pagamentoEntities = pagamentos.map((p) =>
        manager.create(NFePagamento, { ...p, nfeId: saved.id }),
      );
      if (pagamentoEntities.length > 0) await manager.save(NFePagamento, pagamentoEntities);

      return saved;
    });
  }

  async update(id: string, patch: Partial<NFe>): Promise<NFe> {
    await this.repo.update({ id }, patch);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new Error(`NFe ${id} desapareceu durante update`);
    return updated;
  }

  async findByScope(
    companyId: string,
    modelo: string,
    serie: number,
    numero: string,
  ): Promise<NFe | null> {
    return this.repo.findOne({ where: { companyId, modelo, serie, numero } });
  }

  async hardDelete(id: string): Promise<void> {
    // Cascade via FK ON DELETE CASCADE em items/pagamentos/eventos (definido nas migrations).
    await this.repo.delete({ id });
  }

  async list(filter: ListNFesFilter): Promise<{ items: NFe[]; total: number }> {
    const { companyId, status, customerId, from, to, search, limit = 50, offset = 0 } = filter;
    const where: Record<string, unknown> = { companyId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (from && to) where.dhEmissao = Between(from, to);
    else if (from) where.dhEmissao = MoreThanOrEqual(from);
    else if (to) where.dhEmissao = LessThanOrEqual(to);

    const qb = this.repo
      .createQueryBuilder('n')
      .where(where);
    if (search) {
      qb.andWhere(
        '(n.chave_acesso ILIKE :term OR CAST(n.numero AS text) ILIKE :term)',
        { term: `%${search}%` },
      );
    }
    qb.orderBy('n.dh_emissao', 'DESC').limit(limit).offset(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}

import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  IReceivedDocumentRepository,
  ListReceivedDocumentsFilter,
  UpsertReceivedDocumentData,
} from '../../../repositories/IReceivedDocumentRepository';
import { ReceivedDocument } from '../entities/ReceivedDocument';

export class ReceivedDocumentRepository implements IReceivedDocumentRepository {
  private readonly repo: Repository<ReceivedDocument>;

  constructor() {
    this.repo = appDataSource.getRepository(ReceivedDocument);
  }

  async upsertByChave(data: UpsertReceivedDocumentData): Promise<ReceivedDocument> {
    if (data.chaveAcesso) {
      const existing = await this.repo.findOne({
        where: { companyId: data.companyId, chaveAcesso: data.chaveAcesso },
      });
      if (existing) {
        // Atualiza apenas os campos que podem ter mudado (NSU avança, resumo enriquecido).
        await this.repo.update(
          { id: existing.id },
          {
            nsu: data.nsu ?? existing.nsu,
            resumoXml: data.resumoXml ?? existing.resumoXml,
          },
        );
        return (await this.repo.findOne({ where: { id: existing.id } }))!;
      }
    }
    const created = this.repo.create(data);
    return this.repo.save(created);
  }

  async findById(companyId: string, id: string): Promise<ReceivedDocument | null> {
    return this.repo.findOne({ where: { id, companyId } });
  }

  async findByChave(companyId: string, chaveAcesso: string): Promise<ReceivedDocument | null> {
    return this.repo.findOne({ where: { companyId, chaveAcesso } });
  }

  async list(filter: ListReceivedDocumentsFilter): Promise<{
    items: ReceivedDocument[];
    total: number;
  }> {
    const { companyId, status, emitenteCnpj, from, to, limit = 50, offset = 0 } = filter;
    const where: Record<string, unknown> = { companyId };
    if (status) where.status = status;
    if (emitenteCnpj) where.emitenteCnpj = emitenteCnpj;
    if (from && to) where.dhEmissao = Between(from, to);
    else if (from) where.dhEmissao = MoreThanOrEqual(from);
    else if (to) where.dhEmissao = LessThanOrEqual(to);

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { dhEmissao: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  async setXmlCompleto(id: string, xml: string): Promise<void> {
    await this.repo.update({ id }, { xmlCompleto: xml });
  }

  async update(id: string, patch: Partial<ReceivedDocument>): Promise<ReceivedDocument> {
    await this.repo.update({ id }, patch);
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new Error(`ReceivedDocument ${id} desapareceu`);
    return found;
  }
}

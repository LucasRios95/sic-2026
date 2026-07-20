import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateNFeData,
  CreateNFeItemData,
  CreateNFePagamentoData,
  INFeRepository,
  ListNFesFilter,
  NFeListRow,
  NFeXmlExportRow,
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

  async list(filter: ListNFesFilter): Promise<{ items: NFeListRow[]; total: number }> {
    const { companyId, status, customerId, from, to, ano, mes, search, limit = 50, offset = 0 } =
      filter;

    // leftJoinAndSelect do destinatário: o relatório precisa da razão social + CNPJ/CPF.
    // É LEFT porque customer_id é nullable (ex.: NFC-e / rascunho sem cliente).
    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.customer', 'customer')
      .where('n.company_id = :companyId', { companyId });

    if (status) qb.andWhere('n.status = :status', { status });
    if (customerId) qb.andWhere('n.customer_id = :customerId', { customerId });

    // Competência (mês/ano) tem precedência sobre from/to. Avaliada em horário de Brasília
    // (mesmo critério do listXmlByPeriodo) pra bater com a data que aparece na nota.
    if (ano && mes) {
      qb.andWhere(
        "(n.dh_emissao AT TIME ZONE 'America/Sao_Paulo') >= make_date(:ano, :mes, 1)",
        { ano, mes },
      ).andWhere(
        "(n.dh_emissao AT TIME ZONE 'America/Sao_Paulo') < (make_date(:ano, :mes, 1) + interval '1 month')",
      );
    } else if (from && to) {
      qb.andWhere('n.dh_emissao BETWEEN :from AND :to', { from, to });
    } else if (from) {
      qb.andWhere('n.dh_emissao >= :from', { from });
    } else if (to) {
      qb.andWhere('n.dh_emissao <= :to', { to });
    }

    if (search) {
      qb.andWhere(
        '(n.chave_acesso ILIKE :term OR CAST(n.numero AS text) ILIKE :term OR customer.nome_razao ILIKE :term OR customer.cnpj_cpf ILIKE :term)',
        { term: `%${search}%` },
      );
    }
    qb.orderBy('n.dh_emissao', 'DESC').limit(limit).offset(offset);

    const [items, total] = await qb.getManyAndCount();
    // Achata o destinatário nas colunas do relatório; mantém o restante do agregado intacto.
    const rows: NFeListRow[] = items.map((nfe) =>
      Object.assign(nfe, {
        customerNome: nfe.customer?.nomeRazao ?? null,
        customerCnpjCpf: nfe.customer?.cnpjCpf ?? null,
      }),
    );
    return { items: rows, total };
  }

  async listXmlByPeriodo(
    companyId: string,
    ano: number,
    mes: number,
  ): Promise<NFeXmlExportRow[]> {
    // Competência avaliada no horário de Brasília: converte dh_emissao (timestamptz, UTC)
    // para o wall-clock local e compara com [1º do mês, 1º do mês seguinte). Assim uma nota
    // emitida 30/06 22:00 BRT (=01/07 01:00 UTC) continua contando como junho.
    const rows = await this.repo
      .createQueryBuilder('n')
      .select([
        'n.chave_acesso AS "chaveAcesso"',
        'n.numero AS "numero"',
        'n.serie AS "serie"',
        'n.status AS "status"',
        'COALESCE(n.xml_autorizado, n.xml_assinado) AS "xml"',
      ])
      .where('n.company_id = :companyId', { companyId })
      .andWhere(
        "(n.dh_emissao AT TIME ZONE 'America/Sao_Paulo') >= make_date(:ano, :mes, 1)",
        { ano, mes },
      )
      .andWhere(
        "(n.dh_emissao AT TIME ZONE 'America/Sao_Paulo') < (make_date(:ano, :mes, 1) + interval '1 month')",
      )
      .andWhere('n.chave_acesso IS NOT NULL')
      .andWhere('n.status IN (:...statuses)', { statuses: ['AUTHORIZED', 'CANCELLED'] })
      .andWhere('COALESCE(n.xml_autorizado, n.xml_assinado) IS NOT NULL')
      .orderBy('n.numero', 'ASC')
      .getRawMany<NFeXmlExportRow>();
    return rows;
  }
}

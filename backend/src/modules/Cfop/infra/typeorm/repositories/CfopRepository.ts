import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  ICfopRepository,
  ListCfopsFilter,
  UpsertCfopData,
} from '../../../repositories/ICfopRepository';
import { Cfop } from '../entities/Cfop';

export class CfopRepository implements ICfopRepository {
  private readonly repo: Repository<Cfop>;

  constructor() {
    this.repo = appDataSource.getRepository(Cfop);
  }

  async list(filter: ListCfopsFilter = {}): Promise<Cfop[]> {
    const qb = this.repo.createQueryBuilder('c').orderBy('c.codigo', 'ASC');

    if (filter.search) {
      const term = filter.search.trim();
      qb.andWhere(
        '(c.codigo LIKE :term OR LOWER(c.descricao) LIKE :likeTerm OR LOWER(c.grupo) LIKE :likeTerm)',
        { term: `${term}%`, likeTerm: `%${term.toLowerCase()}%` },
      );
    }
    if (filter.tipoOperacao) {
      qb.andWhere('c.tipo_operacao = :tipo', { tipo: filter.tipoOperacao });
    }
    if (filter.escopo) {
      qb.andWhere('c.escopo = :escopo', { escopo: filter.escopo });
    }
    if (filter.apenasGeraCredito) {
      qb.andWhere('c.gera_credito_pis_cofins = true');
    }
    if (filter.apenasAtivos !== false) {
      qb.andWhere('c.ativo = true');
    }

    return qb.limit(1000).getMany();
  }

  async findByCodigo(codigo: string): Promise<Cfop | null> {
    return this.repo.findOne({ where: { codigo } });
  }

  async upsert(data: UpsertCfopData): Promise<Cfop> {
    const existing = await this.findByCodigo(data.codigo);
    if (existing) {
      Object.assign(existing, {
        descricao: data.descricao,
        tipoOperacao: data.tipoOperacao,
        escopo: data.escopo,
        grupo: data.grupo ?? null,
        geraCreditoPisCofins: data.geraCreditoPisCofins ?? false,
        ativo: data.ativo ?? true,
        observacoes: data.observacoes ?? null,
      });
      return this.repo.save(existing);
    }
    const created = this.repo.create({
      codigo: data.codigo,
      descricao: data.descricao,
      tipoOperacao: data.tipoOperacao,
      escopo: data.escopo,
      grupo: data.grupo ?? null,
      geraCreditoPisCofins: data.geraCreditoPisCofins ?? false,
      ativo: data.ativo ?? true,
      observacoes: data.observacoes ?? null,
    });
    return this.repo.save(created);
  }
}

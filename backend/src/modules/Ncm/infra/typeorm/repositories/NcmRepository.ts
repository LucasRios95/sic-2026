import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import { INcmRepository, ListNcmsFilter } from '../../../repositories/INcmRepository';
import { Ncm } from '../entities/Ncm';

export class NcmRepository implements INcmRepository {
  private readonly repo: Repository<Ncm>;

  constructor() {
    this.repo = appDataSource.getRepository(Ncm);
  }

  async findByCodigo(codigoSemPontos: string): Promise<Ncm | null> {
    return this.repo.findOne({ where: { codigoSemPontos } });
  }

  async list(filter: ListNcmsFilter = {}): Promise<{ items: Ncm[]; total: number }> {
    const qb = this.repo.createQueryBuilder('n').where('n.ativo = true');

    if (filter.apenasValidosNfe) {
      qb.andWhere('n.valido_para_nfe = true');
    }
    if (filter.nivel) {
      qb.andWhere('n.nivel = :nivel', { nivel: filter.nivel });
    }
    if (filter.search) {
      const term = filter.search.trim();
      const apenasDigitos = term.replace(/\D/g, '');
      if (apenasDigitos.length >= 2) {
        // Prefix match em código + match em descrição (case-insensitive).
        qb.andWhere(
          '(n.codigo_sem_pontos LIKE :prefix OR LOWER(n.descricao) LIKE :ilike)',
          { prefix: `${apenasDigitos}%`, ilike: `%${term.toLowerCase()}%` },
        );
      } else {
        qb.andWhere('LOWER(n.descricao) LIKE :ilike', {
          ilike: `%${term.toLowerCase()}%`,
        });
      }
    }

    // Ordenação: primeiro código (numérico), depois descrição. Aproximação que mantém
    // a hierarquia visual coerente.
    qb.orderBy('n.codigo_sem_pontos', 'ASC').addOrderBy('n.nivel', 'ASC');

    const limit = Math.min(filter.limit ?? 100, 500);
    const offset = filter.offset ?? 0;

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return { items, total };
  }
}

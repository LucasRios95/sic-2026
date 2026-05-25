import { Repository } from 'typeorm';

import { BusinessRuleError } from '@shared/errors';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  AllocatedNumber,
  INumberingSeriesRepository,
} from '../../../repositories/INumberingSeriesRepository';
import { NumberingSeries } from '../entities/NumberingSeries';

export class NumberingSeriesRepository implements INumberingSeriesRepository {
  private readonly repo: Repository<NumberingSeries>;

  constructor() {
    this.repo = appDataSource.getRepository(NumberingSeries);
  }

  async ensureSeries(companyId: string, modelo: string, serie: number): Promise<void> {
    const existing = await this.repo.findOne({ where: { companyId, modelo, serie } });
    if (existing) return;
    const created = this.repo.create({
      companyId,
      modelo,
      serie,
      proximoNumero: '1',
      active: true,
    });
    await this.repo.save(created);
  }

  /**
   * Aloca o próximo número usando uma transação dedicada com SELECT ... FOR UPDATE.
   * O lock é liberado quando a transação commita ou aborta. Como esta operação é
   * curta (read + update), o impacto em latência é desprezível.
   *
   * Em produção com alta concorrência (>100 emissões/s por série), considerar advisory
   * lock no Postgres (pg_advisory_xact_lock) com chave derivada de hash(companyId, serie).
   */
  async allocateNumber(
    companyId: string,
    modelo: string,
    serie: number,
  ): Promise<AllocatedNumber> {
    return appDataSource.transaction(async (manager) => {
      const series = await manager
        .createQueryBuilder(NumberingSeries, 's')
        .setLock('pessimistic_write')
        .where('s.company_id = :companyId', { companyId })
        .andWhere('s.modelo = :modelo', { modelo })
        .andWhere('s.serie = :serie', { serie })
        .getOne();

      if (!series) {
        throw new BusinessRuleError(
          `Série ${serie}/modelo ${modelo} não cadastrada para esta empresa. Configure em /numbering-series antes de emitir.`,
          'NUMBERING_SERIES_NOT_FOUND',
        );
      }
      if (!series.active) {
        throw new BusinessRuleError(
          `Série ${serie}/modelo ${modelo} está inativa`,
          'NUMBERING_SERIES_INACTIVE',
        );
      }

      const numero = series.proximoNumero;
      const nextNumero = String(BigInt(numero) + 1n);
      await manager.update(
        NumberingSeries,
        { id: series.id },
        { proximoNumero: nextNumero, ultimoUsado: numero },
      );

      return { numero, serie, modelo };
    });
  }
}

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

  async allocateSpecificNumber(
    companyId: string,
    modelo: string,
    serie: number,
    numeroForcado: string,
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
          `Série ${serie}/modelo ${modelo} não cadastrada para esta empresa.`,
          'NUMBERING_SERIES_NOT_FOUND',
        );
      }
      if (!series.active) {
        throw new BusinessRuleError(
          `Série ${serie}/modelo ${modelo} está inativa`,
          'NUMBERING_SERIES_INACTIVE',
        );
      }

      const forcado = BigInt(numeroForcado);
      const atual = BigInt(series.proximoNumero);
      if (forcado < atual) {
        // Já passou desse número — ou foi emitido ou foi inutilizado. Em qualquer
        // caso, reusar quebra a unicidade global da chave de acesso da NF-e.
        throw new BusinessRuleError(
          `Número ${numeroForcado} já foi alocado nesta série. Próximo disponível: ${series.proximoNumero}.`,
          'NUMBERING_SERIES_NUMBER_USED',
          { proximo: series.proximoNumero, solicitado: numeroForcado },
        );
      }

      const nextNumero = String(forcado + 1n);
      await manager.update(
        NumberingSeries,
        { id: series.id },
        { proximoNumero: nextNumero, ultimoUsado: numeroForcado },
      );

      return { numero: numeroForcado, serie, modelo };
    });
  }

  async peekProximoNumero(
    companyId: string,
    modelo: string,
    serie: number,
  ): Promise<string> {
    await this.ensureSeries(companyId, modelo, serie);
    const series = await this.repo.findOne({ where: { companyId, modelo, serie } });
    return series?.proximoNumero ?? '1';
  }

  async peekSeriesInfo(
    companyId: string,
    modelo: string,
    serie: number,
  ): Promise<{ proximoNumero: string; ultimoUsado: string | null }> {
    await this.ensureSeries(companyId, modelo, serie);
    const series = await this.repo.findOne({ where: { companyId, modelo, serie } });
    return {
      proximoNumero: series?.proximoNumero ?? '1',
      ultimoUsado: series?.ultimoUsado ?? null,
    };
  }

  async releaseLastIfMatches(
    companyId: string,
    modelo: string,
    serie: number,
    numero: string,
  ): Promise<{ released: boolean; proximoNumero: string; ultimoUsado: string | null }> {
    return appDataSource.transaction(async (manager) => {
      const series = await manager
        .createQueryBuilder(NumberingSeries, 's')
        .setLock('pessimistic_write')
        .where('s.company_id = :companyId', { companyId })
        .andWhere('s.modelo = :modelo', { modelo })
        .andWhere('s.serie = :serie', { serie })
        .getOne();

      if (!series) {
        return { released: false, proximoNumero: '1', ultimoUsado: null };
      }

      // Só regride quando o número excluído é exatamente o último alocado. Se já houve
      // outra alocação depois, o slot virou um buraco no meio da sequência — devolver o
      // contador criaria ambiguidade. Faturista que quiser oficializar o gap usa Inutilização.
      // Compara via BigInt pra ignorar formatação (zeros à esquerda etc.).
      const numeroBig = BigInt(numero);
      const ultimoBig = series.ultimoUsado != null ? BigInt(series.ultimoUsado) : null;
      if (ultimoBig === null || ultimoBig !== numeroBig) {
        return {
          released: false,
          proximoNumero: series.proximoNumero,
          ultimoUsado: series.ultimoUsado ?? null,
        };
      }

      const novoProximo = String(numeroBig);
      const novoUltimoUsado = numeroBig > 1n ? String(numeroBig - 1n) : null;
      await manager.update(
        NumberingSeries,
        { id: series.id },
        { proximoNumero: novoProximo, ultimoUsado: novoUltimoUsado },
      );

      return { released: true, proximoNumero: novoProximo, ultimoUsado: novoUltimoUsado };
    });
  }
}

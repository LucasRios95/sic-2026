import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Cursor de recepção. PRD ENT-02 (NSU SEFAZ) / ENT-04 (versão Focus).
 *
 * `origem` discrimina o canal: `sefaz_nfe_cte` (distribuição de DF-e SEFAZ via NSU) ou
 * `focus_nfsen` (notas NFS-e Nacional recebidas via Focus, cursor por "versao"). O
 * cursor é uma string para acomodar BigInt (NSU SEFAZ é até 15 dígitos) sem perda de
 * precisão durante consultas SQL.
 */
@Entity('nsu_cursors')
@Index('uq_nsu_cursors_company_origem', ['companyId', 'origem'], { unique: true })
export class NsuCursor extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ type: 'varchar', length: 30 })
  origem!: string; // 'sefaz_nfe_cte' | 'focus_nfsen'

  /** Último NSU/versão processado. String para preservar precisão (BigInt como texto). */
  @Column({ name: 'cursor_value', type: 'varchar', length: 30, default: '0' })
  cursorValue!: string;

  /** Último horário em que tentamos consultar (sucesso ou falha). */
  @Column({ name: 'last_fetched_at', type: 'timestamptz', nullable: true })
  lastFetchedAt?: Date | null;

  /** Último cStat recebido — útil para diagnóstico (138 = sem novidades, 137 = ok). */
  @Column({ name: 'last_c_stat', type: 'varchar', length: 10, nullable: true })
  lastCStat?: string | null;
}

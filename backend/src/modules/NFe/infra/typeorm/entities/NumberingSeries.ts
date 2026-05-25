import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Controle próprio de numeração de DF-e por (empresa, modelo, série). PRD NFE-08.
 *
 * Reserva atômica: o uso correto é via `findAndReserve()` do repositório, que faz
 * `SELECT ... FOR UPDATE` dentro de uma transação para evitar duplicação de número
 * em emissões concorrentes (caso típico: dois faturistas emitindo ao mesmo tempo).
 *
 * `proximoNumero` é BigInt porque a SEFAZ permite até 999.999.999 (9 dígitos no nNF).
 * TypeORM serializa BigInt como string — manipulamos como string aqui para evitar
 * perda de precisão em conversões implícitas.
 */
@Entity('numbering_series')
@Index('uq_numbering_series_scope', ['companyId', 'modelo', 'serie'], { unique: true })
export class NumberingSeries extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ type: 'varchar', length: 2 })
  modelo!: string; // "55" = NF-e, "65" = NFC-e

  @Column({ type: 'int' })
  serie!: number;

  @Column({ name: 'proximo_numero', type: 'bigint' })
  proximoNumero!: string;

  @Column({ name: 'ultimo_usado', type: 'bigint', nullable: true })
  ultimoUsado?: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

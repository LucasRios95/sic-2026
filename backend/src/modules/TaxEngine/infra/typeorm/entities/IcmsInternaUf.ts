import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Alíquota interna de ICMS e FCP geral por UF. Usada para cálculo de DIFAL
 * (alíquota interna do destino - alíquota interestadual) e como referência para
 * operações intraestaduais.
 *
 * Cada UF tem alíquota interna geral; alíquotas específicas por NCM ficam em
 * ProductTaxRule.aliqIcms quando precisam sobrescrever.
 */
@Entity('icms_interna_uf')
@Index('uq_icms_interna_uf_validity', ['uf', 'validFrom'], { unique: true })
@Index('idx_icms_interna_uf_lookup', ['uf', 'validFrom', 'validTo'])
export class IcmsInternaUf extends BaseEntity {
  @Column({ type: 'char', length: 2 })
  uf!: string;

  /** Alíquota interna geral (ex.: 18% em SP, 20% em RJ, 17% em MG). */
  @Column({ name: 'aliq_interna', type: 'numeric', precision: 7, scale: 4 })
  aliqInterna!: string;

  /** Alíquota geral do FCP interno da UF; nula quando a UF não instituiu FCP. */
  @Column({ name: 'aliq_fcp', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqFcp?: string | null;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo?: Date | null;

  @Column({ name: 'fonte_norma', type: 'varchar', length: 200, nullable: true })
  fonteNorma?: string | null;
}

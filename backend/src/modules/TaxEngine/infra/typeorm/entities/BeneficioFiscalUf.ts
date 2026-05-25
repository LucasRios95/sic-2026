import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

export enum TipoBeneficio {
  ISENCAO = 'ISENCAO',
  REDUCAO_BASE = 'REDUCAO_BASE',
  REDUCAO_ALIQUOTA = 'REDUCAO_ALIQUOTA',
  CREDITO_PRESUMIDO = 'CREDITO_PRESUMIDO',
  DIFERIMENTO = 'DIFERIMENTO',
}

/**
 * Benefícios fiscais por UF e produto (ZFM, ALC, regimes setoriais).
 * Identificados pelo código `cBenef` da NF-e, que é incluído no XML quando aplicável.
 */
@Entity('beneficios_fiscais_uf')
@Index('idx_beneficios_lookup', ['uf', 'ncm', 'validFrom', 'validTo'])
export class BeneficioFiscalUf extends BaseEntity {
  @Column({ type: 'char', length: 2 })
  uf!: string;

  /** Nulo = aplicável a qualquer NCM. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  ncm?: string | null;

  @Column({ name: 'cod_beneficio', type: 'varchar', length: 20 })
  codBeneficio!: string;

  @Column({ type: 'varchar', length: 300 })
  descricao!: string;

  @Column({ type: 'enum', enum: TipoBeneficio })
  tipo!: TipoBeneficio;

  /** Percentual de redução de base, alíquota efetiva ou crédito presumido aplicado. */
  @Column({ type: 'numeric', precision: 7, scale: 4, nullable: true })
  percentual?: string | null;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo?: Date | null;

  @Column({ name: 'fonte_norma', type: 'varchar', length: 200, nullable: true })
  fonteNorma?: string | null;
}

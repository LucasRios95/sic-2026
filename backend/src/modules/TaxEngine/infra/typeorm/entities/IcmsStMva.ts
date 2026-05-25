import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * MVA (Margem de Valor Agregado) para ICMS-ST por par (UF origem, UF destino, NCM).
 * Alimentada por protocolos e convênios Confaz. Quando há regra global para o item,
 * ela prevalece sobre o `pMVAST` cadastrado em ProductTaxRule.
 *
 * MVA ajustada (Convênio ICMS 35/2011) é pré-calculada e armazenada por alíquota
 * interestadual aplicável (4% importado, 7%, 12%) — evita refazer a fórmula a cada
 * cálculo no motor tributário.
 *
 * Fórmula MVA ajustada (Conv. 35/2011):
 *   MVA_ajustada = [(1 + MVA_orig) × (1 - aliq_inter) / (1 - aliq_interna_dest)] - 1
 */
@Entity('icms_st_mva')
@Index('uq_icms_st_mva_validity', ['ufOrigem', 'ufDestino', 'ncm', 'validFrom'], {
  unique: true,
})
@Index('idx_icms_st_mva_lookup', ['ufDestino', 'ncm', 'validFrom', 'validTo'])
export class IcmsStMva extends BaseEntity {
  @Column({ name: 'uf_origem', type: 'char', length: 2 })
  ufOrigem!: string;

  @Column({ name: 'uf_destino', type: 'char', length: 2 })
  ufDestino!: string;

  @Column({ type: 'varchar', length: 8 })
  ncm!: string;

  /** Descrição/segmento (ex.: "Autopeças", "Bebidas alcoólicas"). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  descricao?: string | null;

  /** MVA original (operação interna). */
  @Column({ name: 'mva_original', type: 'numeric', precision: 7, scale: 4 })
  mvaOriginal!: string;

  /** MVA ajustada quando origem é importada (alíquota interestadual 4%). */
  @Column({
    name: 'mva_ajustada_4',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  mvaAjustada4?: string | null;

  /** MVA ajustada quando interestadual é 7%. */
  @Column({
    name: 'mva_ajustada_7',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  mvaAjustada7?: string | null;

  /** MVA ajustada quando interestadual é 12%. */
  @Column({
    name: 'mva_ajustada_12',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  mvaAjustada12?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  protocolo?: string | null;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo?: Date | null;

  @Column({ name: 'fonte_norma', type: 'varchar', length: 200, nullable: true })
  fonteNorma?: string | null;
}

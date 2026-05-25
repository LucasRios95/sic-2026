import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Alíquota interestadual de ICMS por par (UF origem, UF destino).
 * Fonte: Resolução do Senado 22/89 (7%/12%) e 13/2012 (4% para mercadorias importadas).
 *
 * É tabela GLOBAL (sem `companyId`) — compartilhada entre todas as empresas. Atualização
 * formal por área de monitoramento normativo conforme o PRD seção 6.1.1.8.
 */
@Entity('interstate_aliquots')
@Index('uq_interstate_aliquots_pair_validity', ['ufOrigem', 'ufDestino', 'validFrom'], {
  unique: true,
})
@Index('idx_interstate_aliquots_lookup', ['ufOrigem', 'ufDestino', 'validFrom', 'validTo'])
export class InterstateAliquot extends BaseEntity {
  @Column({ name: 'uf_origem', type: 'char', length: 2 })
  ufOrigem!: string;

  @Column({ name: 'uf_destino', type: 'char', length: 2 })
  ufDestino!: string;

  /** Alíquota para mercadorias nacionais (tipicamente 7% ou 12%, dependendo do par). */
  @Column({ name: 'aliq_nacional', type: 'numeric', precision: 7, scale: 4 })
  aliqNacional!: string;

  /** Alíquota para mercadorias importadas (atualmente 4% — Res. Senado 13/2012). */
  @Column({ name: 'aliq_importado', type: 'numeric', precision: 7, scale: 4 })
  aliqImportado!: string;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo?: Date | null;

  @Column({ name: 'fonte_norma', type: 'varchar', length: 200, nullable: true })
  fonteNorma?: string | null;
}

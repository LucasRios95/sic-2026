import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import { DocumentStatus, TipoEventoNFe } from '../../../domain/nfe-enums';
import { NFe } from './NFe';

/**
 * Eventos da NF-e — cancelamento, Carta de Correção, Manifestação do Destinatário,
 * EPEC, ECONF (split payment), etc. PRD seção 6.2 (NFE-05, NFE-06, NFE-30).
 *
 * Cada evento tem um `sequencial` por (nfeId, tipoEvento) — útil para CC-e que admite
 * até 20 correções (e vale a última). Cancelamento, Manifestação etc. ficam sempre em
 * `sequencial = 1`.
 */
@Entity('nfe_eventos')
@Index('uq_nfe_eventos_scope', ['nfeId', 'tipoEvento', 'sequencial'], { unique: true })
@Index('idx_nfe_eventos_nfe', ['nfeId'])
export class NFeEvento extends BaseEntity {
  @Column({ name: 'nfe_id', type: 'uuid' })
  nfeId!: string;

  @ManyToOne(() => NFe, (nfe) => nfe.eventos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nfe_id' })
  nfe?: NFe;

  @Column({ name: 'tipo_evento', type: 'enum', enum: TipoEventoNFe })
  tipoEvento!: TipoEventoNFe;

  @Column({ type: 'int', default: 1 })
  sequencial!: number;

  @Column({ name: 'dh_evento', type: 'timestamptz' })
  dhEvento!: Date;

  @Column({ type: 'text', nullable: true })
  justificativa?: string | null;

  /** Payload específico do evento (varia por tipo). JSON livre. */
  @Column({ type: 'jsonb', nullable: true })
  detalhe?: unknown;

  // --- Retorno SEFAZ ---
  @Column({ type: 'varchar', length: 30, nullable: true })
  protocolo?: string | null;

  @Column({ name: 'c_stat', type: 'varchar', length: 10, nullable: true })
  cStat?: string | null;

  @Column({ name: 'x_motivo', type: 'varchar', length: 300, nullable: true })
  xMotivo?: string | null;

  @Column({ name: 'xml_evento', type: 'text', nullable: true })
  xmlEvento?: string | null;

  @Column({ name: 'xml_retorno', type: 'text', nullable: true })
  xmlRetorno?: string | null;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.PENDING })
  status!: DocumentStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;
}

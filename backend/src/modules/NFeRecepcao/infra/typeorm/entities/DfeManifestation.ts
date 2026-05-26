import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import { DocumentStatus } from '../../../../NFe/domain/nfe-enums';
import { TipoManifestacao } from '../../../domain/nfe-recepcao-enums';
import { ReceivedDocument } from './ReceivedDocument';

/**
 * Registro de cada manifestação enviada pela empresa destinatária à SEFAZ.
 * PRD ENT-03 — ciência, confirmação, desconhecimento, operação não realizada.
 *
 * Quando aceita (cStat 135 ou 136), a manifestação destrava o download do XML completo
 * via Distribuição DF-e — o sistema executa esse download automaticamente como passo
 * imediatamente posterior (TSK-143).
 */
@Entity('dfe_manifestations')
@Index('idx_dfe_manifestations_doc', ['receivedDocumentId'])
@Index('idx_dfe_manifestations_status', ['status'])
export class DfeManifestation extends BaseEntity {
  @Column({ name: 'received_document_id', type: 'uuid' })
  receivedDocumentId!: string;

  @ManyToOne(() => ReceivedDocument, (doc) => doc.manifestations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'received_document_id' })
  receivedDocument?: ReceivedDocument;

  @Column({ type: 'enum', enum: TipoManifestacao })
  tipo!: TipoManifestacao;

  /** Obrigatória para DESCONHECIMENTO_OPERACAO e OPERACAO_NAO_REALIZADA. */
  @Column({ type: 'text', nullable: true })
  justificativa?: string | null;

  @Column({ name: 'dh_evento', type: 'timestamptz' })
  dhEvento!: Date;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.PENDING })
  status!: DocumentStatus;

  @Column({ type: 'varchar', length: 30, nullable: true })
  protocolo?: string | null;

  @Column({ name: 'c_stat', type: 'varchar', length: 10, nullable: true })
  cStat?: string | null;

  @Column({ name: 'x_motivo', type: 'varchar', length: 300, nullable: true })
  xMotivo?: string | null;

  @Column({ name: 'enviado_em', type: 'timestamptz', nullable: true })
  enviadoEm?: Date | null;

  @Column({ name: 'retorno_xml', type: 'text', nullable: true })
  retornoXml?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;
}

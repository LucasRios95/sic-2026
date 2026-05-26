import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { ReceivedDocument } from './ReceivedDocument';

/**
 * Histórico de eventos posteriores sobre um documento recebido — CC-e emitida pelo
 * fornecedor, cancelamento por parte dele, EPEC convertido. Permite reconstruir o
 * estado da NF-e ao longo do tempo.
 *
 * Não usa BaseEntity porque não tem `updated_at` — é append-only por design.
 */
@Entity('received_document_versions')
@Index('idx_received_document_versions_doc', ['receivedDocumentId'])
export class ReceivedDocumentVersion {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'received_document_id', type: 'uuid' })
  receivedDocumentId!: string;

  @ManyToOne(() => ReceivedDocument, (doc) => doc.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'received_document_id' })
  receivedDocument?: ReceivedDocument;

  @Column({ type: 'int' })
  versao!: number;

  /** Ex.: "CCE", "CANCELAMENTO", "EVENTO", "ATUALIZACAO_RESUMO". */
  @Column({ name: 'tipo_mudanca', type: 'varchar', length: 30 })
  tipoMudanca!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  constructor() {
    if (!this.id) this.id = uuidv7();
  }
}

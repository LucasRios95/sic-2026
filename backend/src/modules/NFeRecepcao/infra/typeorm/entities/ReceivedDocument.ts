import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { Supplier } from '@modules/Suppliers/infra/typeorm/entities/Supplier';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import {
  OrigemCaptura,
  ReceivedDocumentStatus,
  TipoDFe,
} from '../../../domain/nfe-recepcao-enums';
import { DfeManifestation } from './DfeManifestation';
import { ReceivedDocumentVersion } from './ReceivedDocumentVersion';

/**
 * Documento fiscal eletrônico recebido contra o CNPJ da empresa. PRD seção 6.4.
 *
 * Ciclo de vida:
 *   PENDENTE     — capturada pelo worker de distribuição; aguardando conferência.
 *   CONFERIDO    — operador validou (item-a-item, vínculo com pedido de compra).
 *   ESCRITURADO  — aplicou créditos, gerou título a pagar, deu entrada em estoque.
 *   DEVOLVIDO    — operação não realizada / mercadoria devolvida.
 *
 * Resumo vs. XML completo: a SEFAZ devolve PRIMEIRO um resumo (50 docs por chamada de
 * `nfeDistribuicaoDFe`); o XML completo só sai após a manifestação do destinatário.
 * Por isso `resumoXml` e `xmlCompleto` são separados — preenchemos em momentos diferentes.
 */
@Entity('received_documents')
@Index('uq_received_documents_company_chave', ['companyId', 'chaveAcesso'], {
  unique: true,
  where: '"chave_acesso" IS NOT NULL',
})
@Index('idx_received_documents_company_status', ['companyId', 'status'])
@Index('idx_received_documents_company_emissao', ['companyId', 'dhEmissao'])
@Index('idx_received_documents_emitente', ['emitenteCnpj'])
@Index('idx_received_documents_nsu', ['nsu'])
export class ReceivedDocument extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId?: string | null;

  @ManyToOne(() => Supplier, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: Supplier | null;

  @Column({ type: 'enum', enum: TipoDFe })
  tipo!: TipoDFe;

  @Column({ name: 'chave_acesso', type: 'varchar', length: 44, nullable: true })
  chaveAcesso?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  numero?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  serie?: string | null;

  // --- Emitente (cacheado para listagem sem JOIN) ---
  @Column({ name: 'emitente_cnpj', type: 'varchar', length: 14 })
  emitenteCnpj!: string;

  @Column({ name: 'emitente_nome', type: 'varchar', length: 200 })
  emitenteNome!: string;

  @Column({ name: 'emitente_uf', type: 'char', length: 2, nullable: true })
  emitenteUf?: string | null;

  @Column({ name: 'dh_emissao', type: 'timestamptz' })
  dhEmissao!: Date;

  @Column({ name: 'valor_total', type: 'numeric', precision: 18, scale: 2 })
  valorTotal!: string;

  // --- Cursor ---
  /** NSU SEFAZ para NF-e/CT-e; "versao" Focus para NFS-e Nacional. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  nsu?: string | null;

  @Column({ name: 'versao_focus', type: 'varchar', length: 30, nullable: true })
  versaoFocus?: string | null;

  // --- Estado interno ---
  @Column({
    type: 'enum',
    enum: ReceivedDocumentStatus,
    default: ReceivedDocumentStatus.PENDENTE,
  })
  status!: ReceivedDocumentStatus;

  /** Resumo retornado pela primeira chamada (resNFe). Sempre disponível. */
  @Column({ name: 'resumo_xml', type: 'text', nullable: true })
  resumoXml?: string | null;

  /** XML completo (procNFe) — só fica disponível APÓS manifestação. */
  @Column({ name: 'xml_completo', type: 'text', nullable: true })
  xmlCompleto?: string | null;

  @Column({
    name: 'origem_captura',
    type: 'enum',
    enum: OrigemCaptura,
    default: OrigemCaptura.SEFAZ_DISTRIBUICAO,
  })
  origemCaptura!: OrigemCaptura;

  @Column({ name: 'captured_at', type: 'timestamptz', default: () => 'now()' })
  capturedAt!: Date;

  @Column({ name: 'conferido_em', type: 'timestamptz', nullable: true })
  conferidoEm?: Date | null;

  @Column({ name: 'conferido_by', type: 'uuid', nullable: true })
  conferidoBy?: string | null;

  @Column({ name: 'escriturado_em', type: 'timestamptz', nullable: true })
  escrituradoEm?: Date | null;

  @Column({ type: 'text', nullable: true })
  observacoes?: string | null;

  @OneToMany(() => DfeManifestation, (m) => m.receivedDocument)
  manifestations?: DfeManifestation[];

  @OneToMany(() => ReceivedDocumentVersion, (v) => v.receivedDocument)
  versions?: ReceivedDocumentVersion[];
}

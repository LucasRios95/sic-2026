import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AmbienteSefaz, Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { Customer } from '@modules/Customers/infra/typeorm/entities/Customer';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import {
  DocumentStatus,
  FinalidadeNFe,
  FormaEmissao,
  TipoOperacao,
} from '../../../domain/nfe-enums';
import { NFeEvento } from './NFeEvento';
import { NFeItem } from './NFeItem';
import { NFePagamento } from './NFePagamento';

/**
 * NF-e modelo 55. Espelha o modelo do schema Prisma v1.3 — campos cobrindo regime antigo
 * (ICMS/ICMS-ST/IPI/PIS/COFINS) + Reforma (IBS/CBS/IS) por documento.
 *
 * Convenções:
 *  - `idempotencyKey` único: cliente repetindo a mesma emissão recebe a NFe já existente.
 *  - `chaveAcesso` único só quando preenchida (regime normal de emissão); em contingência
 *    EPEC o XML é gerado antes mesmo da chave estar definitiva — por isso é nullable.
 *  - `(companyId, modelo, serie, numero)` único — invariante de NFe nunca duplicada.
 *  - Status segue a máquina de estados DRAFT → PENDING → PROCESSING → AUTHORIZED/REJECTED.
 *
 * Decimais como string: TypeORM com `numeric` devolve string, e nós mantemos assim para
 * preservar precisão. Conversão para Money/Decimal é responsabilidade dos use cases.
 */
@Entity('nfes')
@Index('uq_nfes_scope_numero', ['companyId', 'modelo', 'serie', 'numero'], { unique: true })
@Index('uq_nfes_chave', ['chaveAcesso'], { unique: true, where: '"chave_acesso" IS NOT NULL' })
@Index('uq_nfes_idempotency', ['idempotencyKey'], { unique: true })
@Index('idx_nfes_company_emissao', ['companyId', 'dhEmissao'])
@Index('idx_nfes_company_status', ['companyId', 'status'])
@Index('idx_nfes_customer', ['customerId'])
export class NFe extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  // --- Identificação fiscal ---
  @Column({ type: 'bigint' })
  numero!: string;

  @Column({ type: 'int' })
  serie!: number;

  @Column({ type: 'varchar', length: 2, default: '55' })
  modelo!: string;

  /** Chave de acesso (44 dígitos) — única por DF-e autorizado. */
  @Column({ name: 'chave_acesso', type: 'varchar', length: 44, nullable: true })
  chaveAcesso?: string | null;

  @Column({ name: 'dh_emissao', type: 'timestamptz' })
  dhEmissao!: Date;

  @Column({ name: 'dh_sai_ent', type: 'timestamptz', nullable: true })
  dhSaiEnt?: Date | null;

  @Column({ name: 'tipo_operacao', type: 'enum', enum: TipoOperacao })
  tipoOperacao!: TipoOperacao;

  @Column({ type: 'enum', enum: FinalidadeNFe, default: FinalidadeNFe.NORMAL })
  finalidade!: FinalidadeNFe;

  @Column({ name: 'natureza_operacao', type: 'varchar', length: 60 })
  naturezaOperacao!: string;

  @Column({ type: 'enum', enum: AmbienteSefaz })
  ambiente!: AmbienteSefaz;

  @Column({
    name: 'forma_emissao',
    type: 'enum',
    enum: FormaEmissao,
    default: FormaEmissao.NORMAL,
  })
  formaEmissao!: FormaEmissao;

  // --- Status interno ---
  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.DRAFT })
  status!: DocumentStatus;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 80 })
  idempotencyKey!: string;

  // --- Retorno SEFAZ ---
  @Column({ name: 'c_stat', type: 'varchar', length: 10, nullable: true })
  cStat?: string | null;

  @Column({ name: 'x_motivo', type: 'varchar', length: 300, nullable: true })
  xMotivo?: string | null;

  @Column({ name: 'protocolo_autorizacao', type: 'varchar', length: 30, nullable: true })
  protocoloAutorizacao?: string | null;

  @Column({ name: 'dh_autorizacao', type: 'timestamptz', nullable: true })
  dhAutorizacao?: Date | null;

  @Column({ name: 'n_prot_cancelamento', type: 'varchar', length: 30, nullable: true })
  nProtCancelamento?: string | null;

  @Column({ name: 'dh_cancelamento', type: 'timestamptz', nullable: true })
  dhCancelamento?: Date | null;

  // --- Totais (regime antigo) ---
  @Column({ name: 'valor_produtos', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorProdutos!: string;

  @Column({ name: 'valor_frete', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorFrete!: string;

  @Column({ name: 'valor_seguro', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorSeguro!: string;

  @Column({ name: 'valor_desconto', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorDesconto!: string;

  @Column({ name: 'valor_outros', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorOutros!: string;

  @Column({ name: 'valor_total', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorTotal!: string;

  @Column({ name: 'base_icms', type: 'numeric', precision: 18, scale: 2, default: '0' })
  baseIcms!: string;

  @Column({ name: 'valor_icms', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorIcms!: string;

  @Column({ name: 'valor_icms_deson', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorIcmsDeson!: string;

  @Column({ name: 'base_icms_st', type: 'numeric', precision: 18, scale: 2, default: '0' })
  baseIcmsST!: string;

  @Column({ name: 'valor_icms_st', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorIcmsST!: string;

  @Column({ name: 'valor_fcp', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorFCP!: string;

  @Column({ name: 'valor_fcp_st', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorFCPST!: string;

  @Column({ name: 'valor_fcp_st_ret', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorFCPSTRet!: string;

  @Column({ name: 'valor_icms_uf_dest', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorICMSUFDest!: string;

  @Column({ name: 'valor_icms_uf_remet', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorICMSUFRemet!: string;

  @Column({ name: 'valor_fcp_uf_dest', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorFCPUFDest!: string;

  @Column({ name: 'valor_ipi', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorIpi!: string;

  @Column({ name: 'valor_pis', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorPis!: string;

  @Column({ name: 'valor_cofins', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorCofins!: string;

  @Column({ name: 'valor_ii', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorII!: string;

  @Column({ name: 'valor_tot_trib', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorTotTrib!: string;

  // --- Totais Reforma (RT 2025.002) ---
  @Column({ name: 'base_ibs_cbs', type: 'numeric', precision: 18, scale: 2, default: '0' })
  baseIbsCbs!: string;

  @Column({ name: 'valor_ibs', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorIbs!: string;

  @Column({ name: 'valor_cbs', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorCbs!: string;

  @Column({ name: 'valor_is', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorIs!: string;

  // --- Indicadores de operação (cacheados para apuração rápida) ---
  @Column({ name: 'operacao_interestadual', type: 'boolean', default: false })
  operacaoInterestadual!: boolean;

  @Column({ name: 'uf_destino', type: 'char', length: 2, nullable: true })
  ufDestino?: string | null;

  // --- Artefatos ---
  @Column({ name: 'xml_assinado', type: 'text', nullable: true })
  xmlAssinado?: string | null;

  @Column({ name: 'xml_autorizado', type: 'text', nullable: true })
  xmlAutorizado?: string | null;

  @Column({ name: 'danfe_url', type: 'varchar', length: 500, nullable: true })
  danfeUrl?: string | null;

  // --- Observações ---
  @Column({ name: 'inf_cpl', type: 'text', nullable: true })
  infCpl?: string | null;

  @Column({ name: 'inf_ad_fisco', type: 'text', nullable: true })
  infAdFisco?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null;

  @OneToMany(() => NFeItem, (item) => item.nfe)
  items?: NFeItem[];

  @OneToMany(() => NFeEvento, (evt) => evt.nfe)
  eventos?: NFeEvento[];

  @OneToMany(() => NFePagamento, (p) => p.nfe)
  pagamentos?: NFePagamento[];
}

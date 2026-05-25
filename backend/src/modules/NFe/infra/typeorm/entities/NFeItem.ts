import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Product } from '@modules/Products/infra/typeorm/entities/Product';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';
import { CstIbsCbs } from '@shared/types/fiscal-enums';

import { NFe } from './NFe';

/**
 * Item da NF-e — espelha NFeItem do schema Prisma v1.3.
 * Cobre regime antigo (ICMS, ST, FCP, DIFAL, IPI, PIS/COFINS) + Reforma (IBS/CBS/IS).
 *
 * Campos com nome em camelCase no TS, snake_case no Postgres. Decimais como string para
 * preservar precisão — quem manipula é o motor tributário (que já usa Money).
 */
@Entity('nfe_items')
@Index('uq_nfe_items_nfe_numero', ['nfeId', 'numeroItem'], { unique: true })
@Index('idx_nfe_items_nfe', ['nfeId'])
export class NFeItem extends BaseEntity {
  @Column({ name: 'nfe_id', type: 'uuid' })
  nfeId!: string;

  @ManyToOne(() => NFe, (nfe) => nfe.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nfe_id' })
  nfe?: NFe;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'product_id' })
  product?: Product | null;

  @Column({ name: 'numero_item', type: 'int' })
  numeroItem!: number;

  @Column({ type: 'varchar', length: 60 })
  codigo!: string;

  @Column({ type: 'varchar', length: 300 })
  descricao!: string;

  @Column({ type: 'varchar', length: 8 })
  ncm!: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cest?: string | null;

  @Column({ type: 'varchar', length: 4 })
  cfop!: string;

  @Column({ name: 'unidade_comercial', type: 'varchar', length: 6 })
  unidadeComercial!: string;

  @Column({
    name: 'quantidade_comercial',
    type: 'numeric',
    precision: 15,
    scale: 4,
  })
  quantidadeComercial!: string;

  @Column({
    name: 'valor_unitario',
    type: 'numeric',
    precision: 21,
    scale: 10,
  })
  valorUnitario!: string;

  @Column({ name: 'valor_total', type: 'numeric', precision: 18, scale: 2 })
  valorTotal!: string;

  @Column({ name: 'valor_desconto', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorDesconto!: string;

  @Column({ name: 'valor_frete', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorFrete!: string;

  @Column({ name: 'valor_seguro', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorSeguro!: string;

  @Column({ name: 'valor_outros', type: 'numeric', precision: 18, scale: 2, default: '0' })
  valorOutros!: string;

  // --- ICMS próprio ---
  @Column({ name: 'cst_icms', type: 'varchar', length: 4, nullable: true })
  cstIcms?: string | null;

  @Column({ name: 'csosn_icms', type: 'varchar', length: 4, nullable: true })
  csosnIcms?: string | null;

  @Column({ name: 'origem_mercadoria', type: 'smallint', nullable: true })
  origemMercadoria?: number | null;

  @Column({ name: 'mod_bc', type: 'smallint', nullable: true })
  modBC?: number | null;

  @Column({ name: 'base_icms', type: 'numeric', precision: 18, scale: 2, nullable: true })
  baseIcms?: string | null;

  @Column({ name: 'p_red_bc', type: 'numeric', precision: 7, scale: 4, nullable: true })
  pRedBC?: string | null;

  @Column({ name: 'aliq_icms', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqIcms?: string | null;

  @Column({ name: 'valor_icms', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorIcms?: string | null;

  @Column({ name: 'c_benef', type: 'varchar', length: 20, nullable: true })
  cBenef?: string | null;

  @Column({ name: 'mot_des_icms', type: 'smallint', nullable: true })
  motDesICMS?: number | null;

  @Column({ name: 'valor_icms_deson', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorIcmsDeson?: string | null;

  // --- ICMS-ST ---
  @Column({ name: 'cst_icms_st', type: 'varchar', length: 4, nullable: true })
  cstIcmsSt?: string | null;

  @Column({ name: 'mod_bc_st', type: 'smallint', nullable: true })
  modBCST?: number | null;

  @Column({ name: 'p_mvast', type: 'numeric', precision: 7, scale: 4, nullable: true })
  pMVAST?: string | null;

  @Column({ name: 'base_icms_st', type: 'numeric', precision: 18, scale: 2, nullable: true })
  baseIcmsST?: string | null;

  @Column({ name: 'aliq_icms_st', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqIcmsST?: string | null;

  @Column({ name: 'valor_icms_st', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorIcmsST?: string | null;

  // --- FCP ---
  @Column({ name: 'base_fcp', type: 'numeric', precision: 18, scale: 2, nullable: true })
  baseFCP?: string | null;

  @Column({ name: 'p_fcp', type: 'numeric', precision: 7, scale: 4, nullable: true })
  pFCP?: string | null;

  @Column({ name: 'valor_fcp', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorFCP?: string | null;

  // --- DIFAL ---
  @Column({ name: 'base_icms_uf_dest', type: 'numeric', precision: 18, scale: 2, nullable: true })
  baseICMSUFDest?: string | null;

  @Column({ name: 'p_icms_uf_dest', type: 'numeric', precision: 7, scale: 4, nullable: true })
  pICMSUFDest?: string | null;

  @Column({ name: 'p_icms_inter', type: 'numeric', precision: 7, scale: 4, nullable: true })
  pICMSInter?: string | null;

  @Column({ name: 'valor_icms_uf_dest', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorICMSUFDest?: string | null;

  @Column({ name: 'valor_icms_uf_remet', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorICMSUFRemet?: string | null;

  @Column({ name: 'base_fcp_uf_dest', type: 'numeric', precision: 18, scale: 2, nullable: true })
  baseFCPUFDest?: string | null;

  @Column({ name: 'p_fcp_uf_dest', type: 'numeric', precision: 7, scale: 4, nullable: true })
  pFCPUFDest?: string | null;

  @Column({ name: 'valor_fcp_uf_dest', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorFCPUFDest?: string | null;

  // --- IPI ---
  @Column({ name: 'cst_ipi', type: 'varchar', length: 4, nullable: true })
  cstIpi?: string | null;

  @Column({ name: 'c_enq', type: 'varchar', length: 4, nullable: true })
  cEnq?: string | null;

  @Column({ name: 'base_ipi', type: 'numeric', precision: 18, scale: 2, nullable: true })
  baseIpi?: string | null;

  @Column({ name: 'aliq_ipi', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqIpi?: string | null;

  @Column({ name: 'valor_ipi', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorIpi?: string | null;

  // --- PIS / COFINS ---
  @Column({ name: 'cst_pis', type: 'varchar', length: 4, nullable: true })
  cstPis?: string | null;

  @Column({ name: 'base_pis', type: 'numeric', precision: 18, scale: 2, nullable: true })
  basePis?: string | null;

  @Column({ name: 'aliq_pis', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqPis?: string | null;

  @Column({ name: 'valor_pis', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorPis?: string | null;

  @Column({ name: 'cst_cofins', type: 'varchar', length: 4, nullable: true })
  cstCofins?: string | null;

  @Column({ name: 'base_cofins', type: 'numeric', precision: 18, scale: 2, nullable: true })
  baseCofins?: string | null;

  @Column({ name: 'aliq_cofins', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqCofins?: string | null;

  @Column({ name: 'valor_cofins', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorCofins?: string | null;

  // --- Reforma — IBS / CBS / IS ---
  @Column({ name: 'cst_ibs_cbs', type: 'enum', enum: CstIbsCbs, nullable: true })
  cstIbsCbs?: CstIbsCbs | null;

  @Column({ name: 'c_class_trib', type: 'varchar', length: 10, nullable: true })
  cClassTrib?: string | null;

  @Column({ name: 'base_ibs_cbs', type: 'numeric', precision: 18, scale: 2, nullable: true })
  baseIbsCbs?: string | null;

  @Column({ name: 'aliq_ibs', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqIbs?: string | null;

  @Column({ name: 'valor_ibs', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorIbs?: string | null;

  @Column({ name: 'aliq_cbs', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqCbs?: string | null;

  @Column({ name: 'valor_cbs', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorCbs?: string | null;

  @Column({ name: 'cst_is', type: 'varchar', length: 4, nullable: true })
  cstIs?: string | null;

  @Column({ name: 'aliq_is', type: 'numeric', precision: 7, scale: 4, nullable: true })
  aliqIs?: string | null;

  @Column({ name: 'valor_is', type: 'numeric', precision: 18, scale: 2, nullable: true })
  valorIs?: string | null;

  @Column({ name: 'inf_ad_prod', type: 'text', nullable: true })
  infAdProd?: string | null;
}

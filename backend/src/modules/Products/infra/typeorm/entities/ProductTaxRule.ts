import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';
import { CstIbsCbs } from '@shared/types/fiscal-enums';

import { Product } from './Product';

/**
 * Tributação de produto versionada por vigência. Espelha o schema Prisma v1.3 (PRD 6.1.1.3–4):
 *   - Regime antigo (transição até 2032): ICMS próprio, ICMS-ST, ICMS desonerado, FCP,
 *     IPI (inclusive por unidade), PIS/COFINS.
 *   - Reforma (IBS, CBS, IS) — convivem com o regime antigo durante a transição.
 *
 * Campos opcionais (a maioria) ficam em branco quando não se aplicam ao produto.
 * O motor tributário (EP-04) decide, em tempo de emissão, quais grupos consumir
 * combinando estas regras com as flags `usaIcms*` da Company e os atributos do destinatário.
 *
 * Invariante: para o mesmo `productId`, as janelas [validFrom, validTo) NÃO podem se sobrepor.
 * A regra "vigente em D" é a única com `validFrom ≤ D AND (validTo IS NULL OR validTo > D)`.
 * Validação ocorre no use case (não há constraint nativa no Postgres para isso sem trigger).
 */
@Entity('product_tax_rules')
@Index('idx_product_tax_rules_product_validity', ['productId', 'validFrom', 'validTo'])
export class ProductTaxRule extends BaseEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.taxRules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  // ===== ICMS próprio (regime antigo) =====
  @Column({ name: 'cst_icms', type: 'varchar', length: 4, nullable: true })
  cstIcms?: string | null;

  @Column({ name: 'csosn_icms', type: 'varchar', length: 4, nullable: true })
  csosnIcms?: string | null;

  @Column({
    name: 'aliq_icms',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  aliqIcms?: string | null;

  /// Modalidade de determinação da BC do ICMS (modBC): 0=MVA, 1=Pauta, 2=Tabelado, 3=Valor da operação
  @Column({ name: 'mod_bc', type: 'smallint', nullable: true })
  modBC?: number | null;

  @Column({
    name: 'p_red_bc',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  pRedBC?: string | null;

  /// Marca produto importado (origens 1, 2, 3, 5, 6, 7, 8) — força alíquota interestadual de 4%
  @Column({ type: 'boolean', default: false })
  importado!: boolean;

  // ===== ICMS Substituição Tributária =====
  @Column({ name: 'cst_icms_st', type: 'varchar', length: 4, nullable: true })
  cstIcmsSt?: string | null;

  @Column({ name: 'mod_bc_st', type: 'smallint', nullable: true })
  modBCST?: number | null;

  @Column({
    name: 'p_mvast',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  pMVAST?: string | null;

  @Column({
    name: 'p_red_bc_st',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  pRedBCST?: string | null;

  @Column({
    name: 'p_icmsst',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  pICMSST?: string | null;

  @Column({
    name: 'p_icms_efetivo',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  pICMSEfetivo?: string | null;

  // ===== ICMS desonerado =====
  /// Motivo da desoneração: 1=Táxi, 3=Produtor agropecuário, 9=Outros, 16=Olimpíadas etc.
  @Column({ name: 'mot_des_icms', type: 'smallint', nullable: true })
  motDesICMS?: number | null;

  // ===== FCP =====
  @Column({
    name: 'p_fcp',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  pFCP?: string | null;

  @Column({
    name: 'p_fcpst',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  pFCPST?: string | null;

  @Column({
    name: 'p_fcpst_ret',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  pFCPSTRet?: string | null;

  // ===== IPI =====
  @Column({ name: 'cst_ipi', type: 'varchar', length: 4, nullable: true })
  cstIpi?: string | null;

  @Column({ name: 'c_enq', type: 'varchar', length: 4, nullable: true })
  cEnq?: string | null;

  @Column({
    name: 'aliq_ipi',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  aliqIpi?: string | null;

  /// IPI por valor unitário (cigarros, bebidas)
  @Column({ name: 'ipi_por_unidade', type: 'boolean', default: false })
  ipiPorUnidade!: boolean;

  @Column({
    name: 'v_unid_ipi',
    type: 'numeric',
    precision: 15,
    scale: 4,
    nullable: true,
  })
  vUnidIpi?: string | null;

  // ===== PIS / COFINS (regime antigo, até 2026/2027) =====
  @Column({ name: 'cst_pis', type: 'varchar', length: 4, nullable: true })
  cstPis?: string | null;

  @Column({
    name: 'aliq_pis',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  aliqPis?: string | null;

  @Column({ name: 'cst_cofins', type: 'varchar', length: 4, nullable: true })
  cstCofins?: string | null;

  @Column({
    name: 'aliq_cofins',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  aliqCofins?: string | null;

  @Column({ name: 'pis_cofins_por_unidade', type: 'boolean', default: false })
  pisCofinsPorUnidade!: boolean;

  @Column({
    name: 'v_unid_pis',
    type: 'numeric',
    precision: 15,
    scale: 4,
    nullable: true,
  })
  vUnidPis?: string | null;

  @Column({
    name: 'v_unid_cofins',
    type: 'numeric',
    precision: 15,
    scale: 4,
    nullable: true,
  })
  vUnidCofins?: string | null;

  // ===== IBS / CBS / IS (Reforma — RT 2025.002) =====
  @Column({
    name: 'cst_ibs_cbs',
    type: 'enum',
    enum: CstIbsCbs,
    nullable: true,
  })
  cstIbsCbs?: CstIbsCbs | null;

  /// Código de Classificação Tributária — dispositivo da LC 214/2025 que ampara a tributação
  @Column({ name: 'c_class_trib', type: 'varchar', length: 10, nullable: true })
  cClassTrib?: string | null;

  /// Alíquota específica do produto que sobrescreve a alíquota padrão da UF/município
  @Column({
    name: 'aliq_ibs_produto',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  aliqIbsProduto?: string | null;

  @Column({
    name: 'aliq_cbs_produto',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  aliqCbsProduto?: string | null;

  @Column({ name: 'cst_is', type: 'varchar', length: 4, nullable: true })
  cstIs?: string | null;

  @Column({
    name: 'aliq_is',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  aliqIs?: string | null;

  /// Incidência do Imposto Seletivo (bens prejudiciais à saúde/ambiente — vigência 2027+)
  @Column({ name: 'incidencia_is', type: 'boolean', default: false })
  incidenciaIs!: boolean;

  // ===== Vigência =====
  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo?: Date | null;
}

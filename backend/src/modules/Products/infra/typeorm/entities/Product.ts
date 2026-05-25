import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import { ProductTaxRule } from './ProductTaxRule';

/**
 * Produto (mercadoria). Carrega identificação fiscal (NCM, CEST, origem) e referências
 * gerais; a tributação propriamente dita vive em ProductTaxRule, versionada por vigência.
 *
 * `origem` (0..8) é a tabela oficial da SEFAZ:
 *   0 — Nacional       1 — Estrangeira importação direta  2 — Estrangeira mercado interno
 *   3 — Nacional ≥40% importado    4 — Nacional Lei de Informática
 *   5 — Nacional <40% importado    6 — Estrangeira sem similar nacional (importação direta)
 *   7 — Estrangeira sem similar nacional (mercado interno)
 *   8 — Nacional ≥70% importado
 *
 * Origens 1, 2, 3, 5, 6, 7, 8 disparam alíquota interestadual de 4% (Res. Senado 13/2012).
 */
@Entity('products')
@Index('uq_products_company_codigo', ['companyId', 'codigo'], { unique: true })
@Index('idx_products_company_ncm', ['companyId', 'ncm'])
@Index('idx_products_codigo_barras', ['codigoBarras'])
export class Product extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ type: 'varchar', length: 60 })
  codigo!: string;

  @Column({ name: 'codigo_barras', type: 'varchar', length: 14, nullable: true })
  codigoBarras?: string | null;

  @Column({ type: 'varchar', length: 300 })
  descricao!: string;

  @Column({ type: 'varchar', length: 8 })
  ncm!: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cest?: string | null;

  /// Origem da mercadoria (0..8). Veja JSDoc da classe.
  @Column({ type: 'smallint' })
  origem!: number;

  @Column({ name: 'unidade_comercial', type: 'varchar', length: 6 })
  unidadeComercial!: string;

  @Column({ name: 'unidade_tributavel', type: 'varchar', length: 6 })
  unidadeTributavel!: string;

  @Column({
    name: 'peso_liquido',
    type: 'numeric',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  pesoLiquido?: string | null;

  @Column({
    name: 'peso_bruto',
    type: 'numeric',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  pesoBruto?: string | null;

  @Column({ name: 'controla_estoque', type: 'boolean', default: true })
  controlaEstoque!: boolean;

  @Column({
    name: 'estoque_atual',
    type: 'numeric',
    precision: 15,
    scale: 3,
    default: '0',
  })
  estoqueAtual!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => ProductTaxRule, (rule) => rule.product)
  taxRules?: ProductTaxRule[];
}

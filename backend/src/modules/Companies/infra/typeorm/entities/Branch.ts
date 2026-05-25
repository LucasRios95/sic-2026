import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import { Company } from './Company';

/**
 * Filial — estabelecimento secundário com CNPJ próprio sob o mesmo grupo.
 * Numerações de DF-e e estoque podem ser segregadas por filial.
 */
@Entity('branches')
@Index('idx_branches_company_id', ['companyId'])
@Index('idx_branches_cnpj', ['cnpj'], { unique: true })
export class Branch extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ type: 'varchar', length: 14 })
  cnpj!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ie?: string | null;

  @Column({ type: 'varchar', length: 200 })
  nome!: string;

  @Column({ type: 'varchar', length: 200 })
  logradouro!: string;

  @Column({ type: 'varchar', length: 20 })
  numero!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  complemento?: string | null;

  @Column({ type: 'varchar', length: 100 })
  bairro!: string;

  @Column({ type: 'varchar', length: 100 })
  municipio!: string;

  @Column({ type: 'char', length: 2 })
  uf!: string;

  @Column({ type: 'varchar', length: 8 })
  cep!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

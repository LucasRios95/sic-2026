import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

import { Company, CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';
import { IndicadorIE, TipoPessoa } from '@shared/types/fiscal-enums';

/**
 * Fornecedor (PJ ou PF). Inclui `crtFornecedor` porque o regime do fornecedor afeta
 * apropriação de crédito de IBS/CBS, crédito presumido em entradas do Simples e
 * tratamento de ST retido anteriormente — informação que o motor tributário precisa
 * para escriturar corretamente as entradas (Fase 1b).
 */
@Entity('suppliers')
@Index('uq_suppliers_company_cnpj_cpf', ['companyId', 'cnpjCpf'], { unique: true })
@Index('idx_suppliers_company_nome', ['companyId', 'nomeRazao'])
export class Supplier extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ name: 'tipo_pessoa', type: 'enum', enum: TipoPessoa })
  tipoPessoa!: TipoPessoa;

  @Column({ name: 'cnpj_cpf', type: 'varchar', length: 20 })
  cnpjCpf!: string;

  @Column({ name: 'nome_razao', type: 'varchar', length: 200 })
  nomeRazao!: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 200, nullable: true })
  nomeFantasia?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ie?: string | null;

  @Column({ name: 'indicador_ie', type: 'enum', enum: IndicadorIE })
  indicadorIE!: IndicadorIE;

  @Column({
    name: 'crt_fornecedor',
    type: 'enum',
    enum: CodigoRegimeTributario,
    nullable: true,
  })
  crtFornecedor?: CodigoRegimeTributario | null;

  /// Marca produtor rural (afeta tratamento ICMS na entrada).
  @Column({ name: 'produtor_rural', type: 'boolean', default: false })
  produtorRural!: boolean;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone?: string | null;

  // --- Endereço ---

  @Column({ type: 'varchar', length: 200 })
  logradouro!: string;

  @Column({ type: 'varchar', length: 20 })
  numero!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  complemento?: string | null;

  @Column({ type: 'varchar', length: 100 })
  bairro!: string;

  @Column({ name: 'codigo_municipio_ibge', type: 'varchar', length: 7 })
  codigoMunicipioIbge!: string;

  @Column({ type: 'varchar', length: 100 })
  municipio!: string;

  @Column({ type: 'char', length: 2 })
  uf!: string;

  @Column({ type: 'varchar', length: 8 })
  cep!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}

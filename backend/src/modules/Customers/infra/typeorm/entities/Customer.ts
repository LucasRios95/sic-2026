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
import { IndicadorIE, IndicadorPresenca, TipoPessoa } from '@shared/types/fiscal-enums';

/**
 * Cliente (pessoa física ou jurídica). Carrega TODOS os atributos fiscais relevantes
 * para o cálculo correto no momento da emissão de NF-e/NFS-e, conforme PRD 6.1.1.2.
 *
 * Atributos chave para tributação:
 *  - crtDestinatario   → afeta partilha de DIFAL e tratamento de ST
 *  - consumidorFinal   → gatilho do DIFAL quando combinado com operação interestadual
 *  - indicadorPresenca → distingue venda presencial, e-commerce e telemarketing
 *  - indicadorIE       → aplicabilidade de DIFAL e ST
 *  - codigoMunicipioIbge → determina UF e par origem/destino para alíquota interestadual
 *  - suframa           → operações com destino à Zona Franca de Manaus
 *  - codigoPais        → exportação (cPais ≠ 1058)
 */
@Entity('customers')
@Index('uq_customers_company_cnpj_cpf', ['companyId', 'cnpjCpf'], { unique: true })
@Index('idx_customers_company_nome', ['companyId', 'nomeRazao'])
export class Customer extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ name: 'tipo_pessoa', type: 'enum', enum: TipoPessoa })
  tipoPessoa!: TipoPessoa;

  /// CNPJ (PJ, 14 dígitos), CPF (PF, 11 dígitos) ou identificador do exterior. Sempre só dígitos.
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

  @Column({ type: 'varchar', length: 20, nullable: true })
  im?: string | null;

  /// Inscrição na SUFRAMA (Zona Franca de Manaus e Áreas de Livre Comércio)
  @Column({ type: 'varchar', length: 20, nullable: true })
  suframa?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone?: string | null;

  // --- Atributos fiscais do destinatário (PRD 6.1.1.2) ---

  @Column({
    name: 'crt_destinatario',
    type: 'enum',
    enum: CodigoRegimeTributario,
    nullable: true,
  })
  crtDestinatario?: CodigoRegimeTributario | null;

  @Column({ name: 'consumidor_final', type: 'boolean', default: false })
  consumidorFinal!: boolean;

  @Column({
    name: 'indicador_presenca',
    type: 'smallint',
    nullable: true,
    transformer: {
      to: (value: IndicadorPresenca | null | undefined) =>
        value === null || value === undefined ? null : Number(value),
      from: (value: number | null) =>
        value === null ? null : (value as IndicadorPresenca),
    },
  })
  indicadorPresenca?: IndicadorPresenca | null;

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

  @Column({ type: 'varchar', length: 60, default: 'Brasil' })
  pais!: string;

  /// Código do país conforme tabela BACEN/SEFAZ; 1058 = Brasil
  @Column({ name: 'codigo_pais', type: 'varchar', length: 4, default: '1058' })
  codigoPais!: string;

  // --- Comercial ---

  @Column({
    name: 'limite_credito',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  limiteCredito?: string | null;

  @Column({ type: 'boolean', default: false })
  bloqueado!: boolean;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}

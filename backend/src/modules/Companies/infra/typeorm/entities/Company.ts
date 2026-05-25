import { Column, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Tenant } from '@modules/Tenants/infra/typeorm/entities/Tenant';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Código de Regime Tributário (CRT) — campo obrigatório do emitente na NF-e.
 * Espelha a tabela oficial da SEFAZ.
 */
export enum CodigoRegimeTributario {
  SIMPLES_NACIONAL = 'SIMPLES_NACIONAL', // CRT 1
  SIMPLES_EXCESSO_SUBLIMITE = 'SIMPLES_EXCESSO_SUBLIMITE', // CRT 2
  REGIME_NORMAL = 'REGIME_NORMAL', // CRT 3
  MEI = 'MEI', // CRT 4
}

export enum AmbienteSefaz {
  HOMOLOGACAO = 'HOMOLOGACAO',
  PRODUCAO = 'PRODUCAO',
}

/**
 * Empresa emitente (CNPJ). Implementa o modelo "schema completo + parametrização por empresa"
 * descrito na seção 6.1.1.1 do PRD: o produto carrega todos os campos fiscais relevantes e cada
 * empresa habilita os grupos de tributos que a sua operação envolve via as flags abaixo.
 */
@Entity('companies')
@Index('idx_companies_tenant_id', ['tenantId'])
@Index('idx_companies_cnpj', ['cnpj'], { unique: true })
export class Company extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 14 })
  cnpj!: string;

  @Column({ name: 'razao_social', type: 'varchar', length: 200 })
  razaoSocial!: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 200, nullable: true })
  nomeFantasia?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ie?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  im?: string | null;

  @Column({ type: 'enum', enum: CodigoRegimeTributario })
  crt!: CodigoRegimeTributario;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cnae?: string | null;

  // --- Endereço da matriz ---

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

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  // --- Configurações fiscais ---

  @Column({
    name: 'ambiente_sefaz',
    type: 'enum',
    enum: AmbienteSefaz,
    default: AmbienteSefaz.HOMOLOGACAO,
  })
  ambienteSefaz!: AmbienteSefaz;

  @Column({
    name: 'ambiente_focus_nfe',
    type: 'enum',
    enum: AmbienteSefaz,
    default: AmbienteSefaz.HOMOLOGACAO,
  })
  ambienteFocusNfe!: AmbienteSefaz;

  @Column({ name: 'emite_nfe', type: 'boolean', default: true })
  emiteNfe!: boolean;

  @Column({ name: 'emite_nfse', type: 'boolean', default: true })
  emiteNfse!: boolean;

  // --- Flags de habilitação tributária (PRD 6.1.1.1) ---
  // Cada flag funciona como interruptor: quando desabilitada, o motor tributário ignora
  // a regra de cálculo correspondente. Permite que empresas de perfis muito diferentes
  // (mercearia intraestadual ≠ indústria com ST ≠ distribuidor interestadual) coexistam
  // no mesmo schema sem migrations nem código condicional disperso.

  @Column({ name: 'usa_icms', type: 'boolean', default: true })
  usaIcms!: boolean;

  @Column({ name: 'usa_icms_st', type: 'boolean', default: false })
  usaIcmsSt!: boolean;

  @Column({ name: 'usa_ipi', type: 'boolean', default: false })
  usaIpi!: boolean;

  @Column({ name: 'usa_difal', type: 'boolean', default: false })
  usaDifal!: boolean;

  @Column({ name: 'usa_fcp', type: 'boolean', default: false })
  usaFcp!: boolean;

  @Column({ name: 'usa_icms_desonerado', type: 'boolean', default: false })
  usaIcmsDesonerado!: boolean;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}

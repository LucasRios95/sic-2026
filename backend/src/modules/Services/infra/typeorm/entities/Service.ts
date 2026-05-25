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

import { ServiceTaxRule } from './ServiceTaxRule';

/**
 * Serviço (para emissão de NFS-e). Combina classificações nacionais (LC 116/2003) e
 * municipais, além do código de tributação nacional (cTribNac) introduzido pela NFS-e Nacional.
 *
 * Cada serviço pode ter múltiplas ServiceTaxRule versionadas — a regra vigente é resolvida
 * pelo motor tributário (Fase 1b) no momento da emissão da DPS/NFS-e.
 */
@Entity('services')
@Index('uq_services_company_codigo', ['companyId', 'codigo'], { unique: true })
@Index('idx_services_company_item', ['companyId', 'itemListaServico'])
export class Service extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ type: 'varchar', length: 60 })
  codigo!: string;

  @Column({ type: 'varchar', length: 300 })
  descricao!: string;

  /// cTribNac — Código de tributação nacional (NFS-e Nacional)
  @Column({
    name: 'codigo_tributacao_nacional',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  codigoTributacaoNacional?: string | null;

  /// Item da Lista de Serviços (LC 116/2003 + atualizações), ex.: "1.05", "17.05"
  @Column({ name: 'item_lista_servico', type: 'varchar', length: 10 })
  itemListaServico!: string;

  /// Código tributário municipal (varia por município)
  @Column({
    name: 'codigo_tributacao_municipal',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  codigoTributacaoMunicipal?: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cnae?: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => ServiceTaxRule, (rule) => rule.service)
  taxRules?: ServiceTaxRule[];
}

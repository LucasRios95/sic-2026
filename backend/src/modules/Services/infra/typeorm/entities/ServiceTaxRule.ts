import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';
import {
  CstIbsCbs,
  IndicadorOperacaoNFSe,
  TipoRetencaoIss,
} from '@shared/types/fiscal-enums';

import { Service } from './Service';

/**
 * Regra tributária de serviço, versionada por vigência. Cobre o regime antigo (ISS na
 * transição, retenções federais) e a Reforma (IBS/CBS na NFS-e — campos cIndOp, cTribNac).
 *
 * Mesma invariante do ProductTaxRule: janelas [validFrom, validTo) não podem se sobrepor
 * para o mesmo `serviceId`. Validação no use case.
 */
@Entity('service_tax_rules')
@Index('idx_service_tax_rules_service_validity', ['serviceId', 'validFrom', 'validTo'])
export class ServiceTaxRule extends BaseEntity {
  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ManyToOne(() => Service, (service) => service.taxRules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service?: Service;

  // ===== ISS (regime antigo, transição) =====
  @Column({ name: 'cst_iss', type: 'varchar', length: 4, nullable: true })
  cstIss?: string | null;

  @Column({
    name: 'aliq_iss',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  aliqIss?: string | null;

  @Column({
    name: 'tipo_retencao',
    type: 'enum',
    enum: TipoRetencaoIss,
    default: TipoRetencaoIss.SEM_RETENCAO,
  })
  tipoRetencao!: TipoRetencaoIss;

  // ===== IBS / CBS (Reforma) =====
  @Column({
    name: 'cst_ibs_cbs',
    type: 'enum',
    enum: CstIbsCbs,
    nullable: true,
  })
  cstIbsCbs?: CstIbsCbs | null;

  @Column({ name: 'c_class_trib', type: 'varchar', length: 10, nullable: true })
  cClassTrib?: string | null;

  @Column({
    name: 'c_ind_op',
    type: 'enum',
    enum: IndicadorOperacaoNFSe,
    nullable: true,
  })
  cIndOp?: IndicadorOperacaoNFSe | null;

  // ===== PIS / COFINS / CSLL retidos (regime antigo) =====
  @Column({ name: 'cst_pis', type: 'varchar', length: 4, nullable: true })
  cstPis?: string | null;

  @Column({ name: 'cst_cofins', type: 'varchar', length: 4, nullable: true })
  cstCofins?: string | null;

  @Column({ name: 'retem_pis_cofins', type: 'boolean', default: false })
  retemPisCofins!: boolean;

  @Column({ name: 'retem_csll', type: 'boolean', default: false })
  retemCsll!: boolean;

  @Column({ name: 'retem_inss', type: 'boolean', default: false })
  retemInss!: boolean;

  @Column({ name: 'retem_ir', type: 'boolean', default: false })
  retemIr!: boolean;

  // ===== Vigência =====
  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo?: Date | null;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

import { NFe } from './NFe';

/**
 * Pagamento informado na NF-e (tag `pag`). PRD NFE-27 — base para o split payment
 * que entra na Fase 4 (ECONF/Evento de Conciliação Financeira).
 *
 * `meio` segue a tabela do MOC: 01=dinheiro, 03=cartão crédito, 17=PIX, 90=sem pagamento etc.
 */
@Entity('nfe_pagamentos')
@Index('idx_nfe_pagamentos_nfe', ['nfeId'])
export class NFePagamento extends BaseEntity {
  @Column({ name: 'nfe_id', type: 'uuid' })
  nfeId!: string;

  @ManyToOne(() => NFe, (nfe) => nfe.pagamentos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nfe_id' })
  nfe?: NFe;

  @Column({ type: 'varchar', length: 2 })
  meio!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  valor!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  bandeira?: string | null;

  @Column({ name: 'cnpj_credenciadora', type: 'varchar', length: 14, nullable: true })
  cnpjCredenciadora?: string | null;

  @Column({ name: 'numero_autorizacao', type: 'varchar', length: 50, nullable: true })
  numeroAutorizacao?: string | null;
}

import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { AmbienteSefaz, Company } from '@modules/Companies/infra/typeorm/entities/Company';

/**
 * Auditoria de cada transmissão à SEFAZ (PRD SEF-01). Append-only, igual ao AuditLog.
 *
 * Quando algo dá errado em produção (rejeição inesperada, latência alta), esta tabela
 * é a fonte primária de investigação:
 *  - `request_xml` mostra exatamente o que enviamos (já assinado)
 *  - `response_xml` mostra o que a SEFAZ devolveu
 *  - `c_stat` é o código padronizado de status (100 = autorizada, 101 = cancelada, etc.)
 *  - `duration_ms` ajuda a detectar degradação de latência da autorizadora
 *
 * Por que NÃO usamos a tabela genérica `audit_logs`:
 *  - Os XMLs podem ser grandes (50KB+) — guardamos em coluna `text` dedicada.
 *  - A indexação por `nfe_id` é frequente (consultar todas as transmissões de uma NF-e).
 *  - O conteúdo é estruturalmente diferente do audit log "ação humana".
 */
@Entity('sefaz_transmissions')
@Index('idx_sefaz_transmissions_company_time', ['companyId', 'createdAt'])
@Index('idx_sefaz_transmissions_nfe', ['nfeId'])
@Index('idx_sefaz_transmissions_cstat', ['cStat'])
export class SefazTransmission {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  /** ID da NF-e relacionada (quando aplicável). Status servico não tem nfeId. */
  @Column({ name: 'nfe_id', type: 'uuid', nullable: true })
  nfeId?: string | null;

  @Column({ type: 'char', length: 2 })
  uf!: string;

  @Column({ type: 'enum', enum: AmbienteSefaz })
  ambiente!: AmbienteSefaz;

  /** Nome do serviço chamado: "NFeAutorizacao4", "NFeStatusServico4", etc. */
  @Column({ type: 'varchar', length: 60 })
  servico!: string;

  /** XML enviado (envelope SOAP + body assinado). */
  @Column({ name: 'request_xml', type: 'text', nullable: true })
  requestXml?: string | null;

  /** XML retornado pela SEFAZ. */
  @Column({ name: 'response_xml', type: 'text', nullable: true })
  responseXml?: string | null;

  @Column({ name: 'http_status', type: 'int', nullable: true })
  httpStatus?: number | null;

  @Column({ name: 'c_stat', type: 'varchar', length: 10, nullable: true })
  cStat?: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs?: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  constructor() {
    if (!this.id) this.id = uuidv7();
  }
}

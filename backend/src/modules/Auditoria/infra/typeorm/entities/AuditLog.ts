import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

/**
 * Trilha de auditoria APPEND-ONLY. Registra ações sensíveis: login, emissão fiscal,
 * cancelamento, alteração de parâmetro tributário, acesso a certificado em cofre.
 *
 * Princípios:
 *  - JAMAIS sofre UPDATE/DELETE pela aplicação. A migration pode aplicar política do
 *    Postgres revogando esses privilégios do role da app.
 *  - Falha em gravar audit log NÃO bloqueia a operação principal (degradação graciosa).
 *    AuditService faz retry assíncrono via BullMQ (fila AUDIT_ASYNC).
 *  - `action` segue o padrão `<modulo>.<verbo>`: "auth.login", "nfe.emit", "vault.read".
 *  - `payload` em JSONB carrega snapshot antes/depois e metadados de contexto.
 *
 * Importante: aqui usamos `created_at` em vez do par created/updated do BaseEntity
 * justamente porque registros NÃO podem ser atualizados.
 */
@Entity('audit_logs')
@Index('idx_audit_logs_company_time', ['companyId', 'occurredAt'])
@Index('idx_audit_logs_entity', ['entityType', 'entityId'])
@Index('idx_audit_logs_user_time', ['userId', 'occurredAt'])
@Index('idx_audit_logs_action', ['action'])
export class AuditLog {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null;

  /** Ex.: "auth.login", "nfe.emit", "vault.read", "company.create". */
  @Column({ type: 'varchar', length: 80 })
  action!: string;

  /** Tipo da entidade-alvo da ação ("nfe", "user", "certificate"). */
  @Column({ name: 'entity_type', type: 'varchar', length: 60 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId?: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent?: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload?: unknown;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  constructor() {
    if (!this.id) this.id = uuidv7();
  }
}

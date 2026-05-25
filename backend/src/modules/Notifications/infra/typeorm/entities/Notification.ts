import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { User } from '@modules/Users/infra/typeorm/entities/User';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

export enum NotificationSeverity {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Notificação para inbox da UI. Emitida por workers (rejeição SEFAZ, certificado a
 * expirar) e por use cases (nota recebida pendente de manifestação).
 *
 * `userId` opcional: quando nulo, é broadcast para todos os usuários da empresa
 * (todos que têm acesso à `companyId` veem a notificação). Útil para alertas de
 * sistema que não têm dono específico.
 */
@Entity('notifications')
@Index('idx_notifications_user_unread', ['userId', 'readAt'])
@Index('idx_notifications_company_category', ['companyId', 'category'])
@Index('idx_notifications_created_at', ['createdAt'])
export class Notification extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  /** Categoria semântica: "rejection", "cert_expiry", "manifest_pending", "contingency_started". */
  @Column({ type: 'varchar', length: 60 })
  category!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({
    type: 'enum',
    enum: NotificationSeverity,
    default: NotificationSeverity.INFO,
  })
  severity!: NotificationSeverity;

  /** URL/rota para deep-link no frontend (ex.: `/fiscal/nfe/01927ab6-...`). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  link?: string | null;

  /** Quando lida. Nulo = não lida. */
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt?: Date | null;
}

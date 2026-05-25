import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Tenant } from '@modules/Tenants/infra/typeorm/entities/Tenant';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

@Entity('users')
@Index('idx_users_tenant_id', ['tenantId'])
@Index('idx_users_email', ['email'], { unique: true })
export class User extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 150 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 200 })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 200 })
  fullName!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled!: boolean;

  @Column({ name: 'mfa_secret', type: 'varchar', length: 200, nullable: true })
  mfaSecret?: string | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date | null;

  @Column({ name: 'failed_logins', type: 'int', default: 0 })
  failedLogins!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil?: Date | null;
}

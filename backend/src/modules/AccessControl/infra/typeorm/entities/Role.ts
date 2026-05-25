import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Papel (RBAC) por tenant. Papéis "system" são pré-definidos e não podem ser editados:
 * Administrador, Gestor, Faturista, Fiscal/Contábil, Compras, Financeiro (PRD 5.2).
 */
@Entity('roles')
@Index('uq_roles_tenant_name', ['tenantId', 'name'], { unique: true })
export class Role extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description?: string | null;

  @Column({ type: 'boolean', default: false })
  system!: boolean;
}

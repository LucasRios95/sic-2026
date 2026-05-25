import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Tenant raiz — organização que opera o sistema. Um tenant pode operar várias Companies (CNPJs).
 * Permite isolar fortemente dados entre clientes que compartilham a mesma instância da aplicação.
 */
@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  slug!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

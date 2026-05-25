import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Permissão global do sistema. Identificada por código semântico namespaced:
 * "nfe.emit", "nfe.cancel", "fin.payable.write", "tax.parameter.edit" etc.
 * É global ao sistema (não a um tenant) porque a lista de operações possíveis
 * é a mesma para todos os clientes que usam o produto.
 */
@Entity('permissions')
@Index('uq_permissions_code', ['code'], { unique: true })
export class Permission extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  code!: string;

  @Column({ type: 'varchar', length: 300 })
  description!: string;
}

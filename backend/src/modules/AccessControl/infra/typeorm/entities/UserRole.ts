import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { User } from '@modules/Users/infra/typeorm/entities/User';

import { Role } from './Role';

/**
 * Vínculo usuário-papel escopado por empresa. companyId nulo significa "aplica a todas
 * as empresas do tenant deste usuário" (papel global). Permite o cenário comum em que
 * um usuário tem papéis diferentes em empresas diferentes (Faturista na empresa A,
 * Fiscal na empresa B).
 */
@Entity('user_roles')
@Index('idx_user_roles_user_id', ['userId'])
export class UserRole {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  // companyId nulo = papel global do tenant. Postgres trata NULL como distinto em
  // unique constraint, então a chave composta funciona como esperamos.
  @PrimaryColumn({ name: 'company_id', type: 'uuid', default: '00000000-0000-0000-0000-000000000000' })
  companyId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: Role;

  @ManyToOne(() => Company, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/**
 * Sentinel value para companyId quando o papel é global ao tenant. Usar um UUID fixo
 * (zerado) em vez de NULL evita que Postgres trate como distinto na unique constraint
 * composta, garantindo idempotência ao atribuir o mesmo papel global mais de uma vez.
 */
export const GLOBAL_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

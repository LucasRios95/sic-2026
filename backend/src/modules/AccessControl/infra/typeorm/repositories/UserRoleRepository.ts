import { Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  AssignUserRoleData,
  IUserRoleRepository,
  UserPermissionContext,
} from '../../../repositories/IUserRoleRepository';
import { GLOBAL_COMPANY_ID, UserRole } from '../entities/UserRole';

export class UserRoleRepository implements IUserRoleRepository {
  private readonly repo: Repository<UserRole>;

  constructor() {
    this.repo = appDataSource.getRepository(UserRole);
  }

  async assign(data: AssignUserRoleData): Promise<UserRole> {
    const companyId = data.companyId ?? GLOBAL_COMPANY_ID;
    const existing = await this.repo.findOne({
      where: { userId: data.userId, roleId: data.roleId, companyId },
    });
    if (existing) return existing;
    const created = this.repo.create({ userId: data.userId, roleId: data.roleId, companyId });
    return this.repo.save(created);
  }

  async revoke(data: AssignUserRoleData): Promise<void> {
    const companyId = data.companyId ?? GLOBAL_COMPANY_ID;
    await this.repo.delete({ userId: data.userId, roleId: data.roleId, companyId });
  }

  async findByUser(userId: string): Promise<UserRole[]> {
    return this.repo.find({
      where: { userId },
      relations: { role: true, company: true },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Carrega papéis, permissões e empresas acessíveis em uma única consulta agregada.
   * Resultado é cacheável por requisição (não persistido) e cabe no payload do JWT.
   */
  async loadContextForUser(userId: string): Promise<UserPermissionContext> {
    const rows = await appDataSource.query<
      Array<{ permission_code: string; role_name: string; company_id: string }>
    >(
      `
      SELECT DISTINCT
        p.code AS permission_code,
        r.name AS role_name,
        ur.company_id AS company_id
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
      `,
      [userId],
    );

    const permissions = new Set<string>();
    const roles = new Set<string>();
    const companyIds = new Set<string>();

    for (const row of rows) {
      if (row.permission_code) permissions.add(row.permission_code);
      if (row.role_name) roles.add(row.role_name);
      if (row.company_id) companyIds.add(row.company_id);
    }

    return {
      permissions: [...permissions],
      roles: [...roles],
      // GLOBAL_COMPANY_ID significa "qualquer empresa do tenant"; o middleware tenantContext
      // resolve isso para todas as empresas reais quando filtra acesso.
      accessibleCompanyIds: [...companyIds],
    };
  }
}

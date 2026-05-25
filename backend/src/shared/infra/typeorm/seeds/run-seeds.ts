import 'reflect-metadata';

import { hash } from 'bcryptjs';

import { GLOBAL_COMPANY_ID } from '@modules/AccessControl/infra/typeorm/entities/UserRole';
import { authConfig } from '@config/auth';
import { logger } from '@shared/logger';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from './permissions';
import { seedTaxGlobals } from './tax-globals-seed';

/**
 * Seed idempotente: cria as permissões do catálogo, papéis pré-definidos do PRD e
 * um tenant + usuário admin de bootstrap para que dev consiga logar logo após
 * subir a aplicação. Em produção, o admin inicial deve ter sua senha trocada na
 * primeira sessão (recomenda-se forçar a troca via flag — fora do escopo desta fase).
 */
async function run(): Promise<void> {
  await appDataSource.initialize();

  await appDataSource.transaction(async (manager) => {
    logger.info('Iniciando seed: permissões');

    // 1) Permissões
    const permissionMap = new Map<string, string>();
    for (const p of SYSTEM_PERMISSIONS) {
      const result = await manager.query<Array<{ id: string }>>(
        `INSERT INTO permissions (id, code, description, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, now(), now())
         ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
         RETURNING id`,
        [p.code, p.description],
      );
      permissionMap.set(p.code, result[0].id);
    }
    logger.info({ count: permissionMap.size }, 'Permissões persistidas');

    // 2) Tenant padrão (apenas para dev/bootstrap)
    const tenantSlug = 'default';
    const existingTenant = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM tenants WHERE slug = $1`,
      [tenantSlug],
    );
    let tenantId: string;
    if (existingTenant.length === 0) {
      const result = await manager.query<Array<{ id: string }>>(
        `INSERT INTO tenants (id, name, slug, active, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Tenant Padrão', $1, true, now(), now())
         RETURNING id`,
        [tenantSlug],
      );
      tenantId = result[0].id;
      logger.info({ tenantId }, 'Tenant padrão criado');
    } else {
      tenantId = existingTenant[0].id;
    }

    // 3) Papéis pré-definidos
    const roleMap = new Map<string, string>();
    for (const role of SYSTEM_ROLES) {
      const existingRole = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2`,
        [tenantId, role.name],
      );
      let roleId: string;
      if (existingRole.length === 0) {
        const result = await manager.query<Array<{ id: string }>>(
          `INSERT INTO roles (id, tenant_id, name, description, system, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, true, now(), now())
           RETURNING id`,
          [tenantId, role.name, role.description],
        );
        roleId = result[0].id;
      } else {
        roleId = existingRole[0].id;
      }
      roleMap.set(role.name, roleId);

      for (const permCode of role.permissions) {
        const permId = permissionMap.get(permCode);
        if (!permId) {
          logger.warn({ permCode, role: role.name }, 'Permissão referenciada por papel não encontrada — pulando');
          continue;
        }
        await manager.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [roleId, permId],
        );
      }
    }
    logger.info({ count: roleMap.size }, 'Papéis e vínculos de permissão persistidos');

    // 4) Admin de bootstrap
    const adminEmail = 'admin@sic.local';
    const existingUser = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM users WHERE email = $1`,
      [adminEmail],
    );
    let adminId: string;
    if (existingUser.length === 0) {
      const passwordHash = await hash('Admin@123', authConfig.password.bcryptCost);
      const result = await manager.query<Array<{ id: string }>>(
        `INSERT INTO users (id, tenant_id, email, password_hash, full_name, active, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Administrador', true, now(), now())
         RETURNING id`,
        [tenantId, adminEmail, passwordHash],
      );
      adminId = result[0].id;
      logger.info({ adminId, adminEmail }, 'Usuário admin de bootstrap criado (senha: Admin@123 — TROQUE EM PRODUÇÃO)');
    } else {
      adminId = existingUser[0].id;
    }

    const adminRoleId = roleMap.get('Administrador');
    if (adminRoleId) {
      await manager.query(
        `INSERT INTO user_roles (user_id, role_id, company_id, created_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT DO NOTHING`,
        [adminId, adminRoleId, GLOBAL_COMPANY_ID],
      );
    }
  });

  // 5) Tabelas globais fiscais (EP-04): alíquotas, FCP, parâmetros da Reforma.
  await seedTaxGlobals();

  await appDataSource.destroy();
  logger.info('Seed concluído com sucesso');
}

run().catch((err) => {
  logger.fatal({ err }, 'Falha ao executar seed');
  process.exit(1);
});

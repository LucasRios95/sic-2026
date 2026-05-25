import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration inicial: cria as tabelas de tenant, empresa, filial, usuário, refresh token,
 * papéis (RBAC) e permissões. Esta é a base sobre a qual os módulos fiscais (NF-e, NFS-e,
 * cadastros tributários) serão construídos nas próximas fases.
 */
export class CreateBaseSchema1716340800000 implements MigrationInterface {
  name = 'CreateBaseSchema1716340800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Enums ---
    await queryRunner.query(`
      CREATE TYPE "companies_crt_enum" AS ENUM (
        'SIMPLES_NACIONAL', 'SIMPLES_EXCESSO_SUBLIMITE', 'REGIME_NORMAL', 'MEI'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "companies_ambiente_sefaz_enum" AS ENUM ('HOMOLOGACAO', 'PRODUCAO')
    `);
    await queryRunner.query(`
      CREATE TYPE "companies_ambiente_focus_nfe_enum" AS ENUM ('HOMOLOGACAO', 'PRODUCAO')
    `);

    // --- Tenant ---
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid PRIMARY KEY,
        "name" varchar(200) NOT NULL,
        "slug" varchar(80) NOT NULL UNIQUE,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // --- Company ---
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id" uuid PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "cnpj" varchar(14) NOT NULL,
        "razao_social" varchar(200) NOT NULL,
        "nome_fantasia" varchar(200),
        "ie" varchar(20),
        "im" varchar(20),
        "crt" "companies_crt_enum" NOT NULL,
        "cnae" varchar(7),
        "logradouro" varchar(200) NOT NULL,
        "numero" varchar(20) NOT NULL,
        "complemento" varchar(100),
        "bairro" varchar(100) NOT NULL,
        "codigo_municipio_ibge" varchar(7) NOT NULL,
        "municipio" varchar(100) NOT NULL,
        "uf" char(2) NOT NULL,
        "cep" varchar(8) NOT NULL,
        "telefone" varchar(20),
        "email" varchar(150),
        "ambiente_sefaz" "companies_ambiente_sefaz_enum" NOT NULL DEFAULT 'HOMOLOGACAO',
        "ambiente_focus_nfe" "companies_ambiente_focus_nfe_enum" NOT NULL DEFAULT 'HOMOLOGACAO',
        "emite_nfe" boolean NOT NULL DEFAULT true,
        "emite_nfse" boolean NOT NULL DEFAULT true,
        "usa_icms" boolean NOT NULL DEFAULT true,
        "usa_icms_st" boolean NOT NULL DEFAULT false,
        "usa_ipi" boolean NOT NULL DEFAULT false,
        "usa_difal" boolean NOT NULL DEFAULT false,
        "usa_fcp" boolean NOT NULL DEFAULT false,
        "usa_icms_desonerado" boolean NOT NULL DEFAULT false,
        "active" boolean NOT NULL DEFAULT true,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_companies_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_companies_tenant_id" ON "companies"("tenant_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_companies_cnpj" ON "companies"("cnpj")`);

    // --- Branch ---
    await queryRunner.query(`
      CREATE TABLE "branches" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "cnpj" varchar(14) NOT NULL,
        "ie" varchar(20),
        "nome" varchar(200) NOT NULL,
        "logradouro" varchar(200) NOT NULL,
        "numero" varchar(20) NOT NULL,
        "complemento" varchar(100),
        "bairro" varchar(100) NOT NULL,
        "municipio" varchar(100) NOT NULL,
        "uf" char(2) NOT NULL,
        "cep" varchar(8) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_branches_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_branches_company_id" ON "branches"("company_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_branches_cnpj" ON "branches"("cnpj")`);

    // --- Users ---
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "email" varchar(150) NOT NULL,
        "password_hash" varchar(200) NOT NULL,
        "full_name" varchar(200) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "mfa_enabled" boolean NOT NULL DEFAULT false,
        "mfa_secret" varchar(200),
        "last_login_at" timestamptz,
        "failed_logins" int NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_users_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_users_tenant_id" ON "users"("tenant_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_users_email" ON "users"("email")`);

    // --- Refresh tokens ---
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "token_hash" varchar(200) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "user_agent" varchar(300),
        "ip_address" varchar(45),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_refresh_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens"("user_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens"("token_hash")`,
    );

    // --- Roles ---
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" varchar(300),
        "system" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_roles_tenant_name" ON "roles"("tenant_id", "name")`);

    // --- Permissions ---
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid PRIMARY KEY,
        "code" varchar(120) NOT NULL,
        "description" varchar(300) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_permissions_code" ON "permissions"("code")`);

    // --- Role-Permission ---
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "fk_role_permissions_role"
          FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_role_permissions_permission"
          FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `);

    // --- User-Role ---
    // companyId é UUID v4 zerado quando o papel é global ao tenant (sentinel). Postgres
    // trata NULL como distinto em PK, então adotar um sentinel garante que o mesmo papel
    // global atribuído duas vezes ao mesmo usuário falhe na PK (idempotência via upsert).
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "company_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "role_id", "company_id"),
        CONSTRAINT "fk_user_roles_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_roles_role"
          FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_user_roles_user_id" ON "user_roles"("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "companies_ambiente_focus_nfe_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "companies_ambiente_sefaz_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "companies_crt_enum"`);
  }
}

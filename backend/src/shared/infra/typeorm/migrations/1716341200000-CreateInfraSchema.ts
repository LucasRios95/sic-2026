import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration do EP-05: tabelas de infraestrutura compartilhada (audit_logs append-only +
 * notifications inbox). Cada uma carrega seus índices otimizados para os filtros mais
 * comuns ("eventos do usuário X nas últimas 24h", "notificações não lidas da empresa Y").
 */
export class CreateInfraSchema1716341200000 implements MigrationInterface {
  name = 'CreateInfraSchema1716341200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notification_severity_enum" AS ENUM ('info', 'warn', 'error')
    `);

    // --- Audit log append-only ---
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid,
        "user_id" uuid,
        "action" varchar(80) NOT NULL,
        "entity_type" varchar(60) NOT NULL,
        "entity_id" uuid,
        "ip_address" varchar(45),
        "user_agent" varchar(300),
        "request_id" varchar(64),
        "payload" jsonb,
        "occurred_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // NOTA: append-only é garantido por convenção no código (sem método UPDATE/DELETE no
    // IAuditLogRepository). Em produção, recomenda-se também aplicar:
    //   REVOKE UPDATE, DELETE ON audit_logs FROM <app_role>;
    // — quando o role da aplicação for distinto do owner. Não fazemos aqui porque o role
    // de migration e de runtime são iguais em dev.

    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_company_time" ON "audit_logs"("company_id", "occurred_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_entity" ON "audit_logs"("entity_type", "entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_user_time" ON "audit_logs"("user_id", "occurred_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action")`,
    );

    // --- Notifications ---
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "user_id" uuid,
        "category" varchar(60) NOT NULL,
        "title" varchar(200) NOT NULL,
        "message" text NOT NULL,
        "severity" "notification_severity_enum" NOT NULL DEFAULT 'info',
        "link" varchar(300),
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_notifications_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_notifications_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    // Índice parcial para o cenário mais quente: "notificações não lidas do usuário X".
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_user_unread"
        ON "notifications"("user_id", "created_at" DESC)
        WHERE "read_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_company_category"
        ON "notifications"("company_id", "category")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_created_at" ON "notifications"("created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_severity_enum"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration EP-06c — saúde da SEFAZ por autorizadora/ambiente.
 *
 * Uma única tabela `sefaz_health_status` é o estado consultado pelo `EmitirNFeUseCase`
 * para decidir entre transmitir pela autorizadora normal ou rotear para SVC. Worker
 * dedicado (`SefazHealthCheckWorker`) é o único escritor.
 */
export class CreateSefazHealthSchema1716341700000 implements MigrationInterface {
  name = 'CreateSefazHealthSchema1716341700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "sefaz_health_state_enum" AS ENUM (
        'UP', 'DEGRADED', 'DOWN', 'UNKNOWN'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sefaz_health_status" (
        "id" uuid PRIMARY KEY,
        "autorizadora" varchar(10) NOT NULL,
        "ambiente" "companies_ambiente_sefaz_enum" NOT NULL,
        "state" "sefaz_health_state_enum" NOT NULL DEFAULT 'UNKNOWN',
        "state_since" timestamptz,
        "last_check_at" timestamptz,
        "last_c_stat" varchar(10),
        "last_x_motivo" varchar(300),
        "mean_latency_ms" int,
        "consecutive_failures" int NOT NULL DEFAULT 0,
        "consecutive_successes" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_sefaz_health_status_authority_env"
        ON "sefaz_health_status"("autorizadora", "ambiente")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_sefaz_health_status_authority_env"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sefaz_health_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sefaz_health_state_enum"`);
  }
}

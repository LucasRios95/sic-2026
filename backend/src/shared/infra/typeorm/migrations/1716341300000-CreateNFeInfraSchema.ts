import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration da Fase 1a — EP-06: tabela de auditoria de transmissões SEFAZ.
 * As tabelas das entidades NF-e/NFeItem/NFeEvento entram no EP-07.
 */
export class CreateNFeInfraSchema1716341300000 implements MigrationInterface {
  name = 'CreateNFeInfraSchema1716341300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // O enum `companies_ambiente_sefaz_enum` já existe da migration inicial — reusamos.
    await queryRunner.query(`
      CREATE TABLE "sefaz_transmissions" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "nfe_id" uuid,
        "uf" char(2) NOT NULL,
        "ambiente" "companies_ambiente_sefaz_enum" NOT NULL,
        "servico" varchar(60) NOT NULL,
        "request_xml" text,
        "response_xml" text,
        "http_status" int,
        "c_stat" varchar(10),
        "duration_ms" int,
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_sefaz_transmissions_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sefaz_transmissions_company_time"
        ON "sefaz_transmissions"("company_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sefaz_transmissions_nfe" ON "sefaz_transmissions"("nfe_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sefaz_transmissions_cstat" ON "sefaz_transmissions"("c_stat")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sefaz_transmissions"`);
  }
}

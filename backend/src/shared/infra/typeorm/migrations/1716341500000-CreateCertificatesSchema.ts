import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration EP-06b: tabela `certificates` para custódia auditável de e-CNPJ A1/A3.
 * Conteúdo cifrado vive no cofre (`ICertificateVault`); aqui só ficam os metadados
 * + referência opaca `vault_ref` — vazamento do banco não compromete os segredos.
 */
export class CreateCertificatesSchema1716341500000 implements MigrationInterface {
  name = 'CreateCertificatesSchema1716341500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "certificate_type_enum" AS ENUM ('A1', 'A3')
    `);

    await queryRunner.query(`
      CREATE TABLE "certificates" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "alias" varchar(100) NOT NULL,
        "tipo" "certificate_type_enum" NOT NULL DEFAULT 'A1',
        "subject" varchar(500) NOT NULL,
        "common_name" varchar(200) NOT NULL,
        "cnpj_titular" varchar(14),
        "serial_number" varchar(80) NOT NULL,
        "thumbprint" varchar(64) NOT NULL,
        "valid_from" timestamptz NOT NULL,
        "valid_to" timestamptz NOT NULL,
        "vault_ref" varchar(200) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "revoked_at" timestamptz,
        "revoked_by" uuid,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_certificates_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_certificates_company_active"
        ON "certificates"("company_id", "active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_certificates_valid_to" ON "certificates"("valid_to")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_certificates_thumbprint" ON "certificates"("thumbprint")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "certificates"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "certificate_type_enum"`);
  }
}

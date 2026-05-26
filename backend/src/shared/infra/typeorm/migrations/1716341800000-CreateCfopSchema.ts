import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: catálogo de CFOPs. Tabela global (sem company_id) compartilhada por
 * todos os tenants. Populada via seed (Ajuste Sinief + Tabela RFB de PIS/COFINS).
 */
export class CreateCfopSchema1716341800000 implements MigrationInterface {
  name = 'CreateCfopSchema1716341800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "cfop_tipo_operacao_enum" AS ENUM ('ENTRADA', 'SAIDA')
    `);
    await queryRunner.query(`
      CREATE TYPE "cfop_escopo_enum" AS ENUM ('ESTADUAL', 'INTERESTADUAL', 'EXTERIOR')
    `);

    await queryRunner.query(`
      CREATE TABLE "cfops" (
        "id" uuid PRIMARY KEY,
        "codigo" char(4) NOT NULL,
        "descricao" varchar(500) NOT NULL,
        "tipo_operacao" "cfop_tipo_operacao_enum" NOT NULL,
        "escopo" "cfop_escopo_enum" NOT NULL,
        "grupo" varchar(200),
        "gera_credito_pis_cofins" boolean NOT NULL DEFAULT false,
        "ativo" boolean NOT NULL DEFAULT true,
        "observacoes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_cfops_codigo" ON "cfops"("codigo")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cfops_tipo_escopo" ON "cfops"("tipo_operacao", "escopo")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cfops_tipo_escopo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_cfops_codigo"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cfops"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cfop_escopo_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cfop_tipo_operacao_enum"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: catálogo NCM (Nomenclatura Comum do Mercosul).
 *
 * Tabela global (sem company_id). Cerca de 15 mil entradas considerando toda a hierarquia
 * (cap. → posição → sub-posição → item → NCM 8 dígitos). Populada pelo seed a partir do
 * arquivo oficial CAMEX (docs/Tabela_NCM_Vigente_*.json).
 */
export class CreateNcmSchema1716341900000 implements MigrationInterface {
  name = 'CreateNcmSchema1716341900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ncms" (
        "id" uuid PRIMARY KEY,
        "codigo" varchar(12) NOT NULL,
        "codigo_sem_pontos" varchar(8) NOT NULL,
        "descricao" varchar(500) NOT NULL,
        "nivel" smallint NOT NULL,
        "valido_para_nfe" boolean NOT NULL DEFAULT false,
        "data_inicio" date,
        "data_fim" date,
        "ato" varchar(100),
        "ativo" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_ncms_codigo_sem_pontos" ON "ncms"("codigo_sem_pontos")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ncms_valido_nfe" ON "ncms"("valido_para_nfe", "ativo")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_ncms_nivel" ON "ncms"("nivel")`);
    // Index pra busca por descrição (autocomplete). pg_trgm seria ideal mas evita
    // dependência opcional — busca via LIKE com índice básico.
    await queryRunner.query(
      `CREATE INDEX "idx_ncms_descricao_lower" ON "ncms"(LOWER("descricao"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ncms_descricao_lower"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ncms_nivel"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ncms_valido_nfe"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_ncms_codigo_sem_pontos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ncms"`);
  }
}

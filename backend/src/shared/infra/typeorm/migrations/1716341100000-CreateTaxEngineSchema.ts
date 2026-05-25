import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration do EP-04: tabelas globais fiscais (alíquotas oficiais, MVA, benefícios) e
 * parâmetros tributários versionados. São compartilhadas entre todas as empresas e
 * representam a fonte da verdade para o motor tributário.
 */
export class CreateTaxEngineSchema1716341100000 implements MigrationInterface {
  name = 'CreateTaxEngineSchema1716341100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "tipo_beneficio_enum" AS ENUM (
        'ISENCAO', 'REDUCAO_BASE', 'REDUCAO_ALIQUOTA', 'CREDITO_PRESUMIDO', 'DIFERIMENTO'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "interstate_aliquots" (
        "id" uuid PRIMARY KEY,
        "uf_origem" char(2) NOT NULL,
        "uf_destino" char(2) NOT NULL,
        "aliq_nacional" numeric(7,4) NOT NULL,
        "aliq_importado" numeric(7,4) NOT NULL,
        "valid_from" timestamptz NOT NULL,
        "valid_to" timestamptz,
        "fonte_norma" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_interstate_aliquots_pair_validity"
        ON "interstate_aliquots"("uf_origem", "uf_destino", "valid_from")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_interstate_aliquots_lookup"
        ON "interstate_aliquots"("uf_origem", "uf_destino", "valid_from", "valid_to")`,
    );

    await queryRunner.query(`
      CREATE TABLE "icms_interna_uf" (
        "id" uuid PRIMARY KEY,
        "uf" char(2) NOT NULL,
        "aliq_interna" numeric(7,4) NOT NULL,
        "aliq_fcp" numeric(7,4),
        "valid_from" timestamptz NOT NULL,
        "valid_to" timestamptz,
        "fonte_norma" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_icms_interna_uf_validity"
        ON "icms_interna_uf"("uf", "valid_from")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_icms_interna_uf_lookup"
        ON "icms_interna_uf"("uf", "valid_from", "valid_to")`,
    );

    await queryRunner.query(`
      CREATE TABLE "icms_st_mva" (
        "id" uuid PRIMARY KEY,
        "uf_origem" char(2) NOT NULL,
        "uf_destino" char(2) NOT NULL,
        "ncm" varchar(8) NOT NULL,
        "descricao" varchar(200),
        "mva_original" numeric(7,4) NOT NULL,
        "mva_ajustada_4" numeric(7,4),
        "mva_ajustada_7" numeric(7,4),
        "mva_ajustada_12" numeric(7,4),
        "protocolo" varchar(50),
        "valid_from" timestamptz NOT NULL,
        "valid_to" timestamptz,
        "fonte_norma" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_icms_st_mva_validity"
        ON "icms_st_mva"("uf_origem", "uf_destino", "ncm", "valid_from")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_icms_st_mva_lookup"
        ON "icms_st_mva"("uf_destino", "ncm", "valid_from", "valid_to")`,
    );

    await queryRunner.query(`
      CREATE TABLE "beneficios_fiscais_uf" (
        "id" uuid PRIMARY KEY,
        "uf" char(2) NOT NULL,
        "ncm" varchar(8),
        "cod_beneficio" varchar(20) NOT NULL,
        "descricao" varchar(300) NOT NULL,
        "tipo" "tipo_beneficio_enum" NOT NULL,
        "percentual" numeric(7,4),
        "valid_from" timestamptz NOT NULL,
        "valid_to" timestamptz,
        "fonte_norma" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_beneficios_lookup"
        ON "beneficios_fiscais_uf"("uf", "ncm", "valid_from", "valid_to")`,
    );

    await queryRunner.query(`
      CREATE TABLE "tax_parameters" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid,
        "chave" varchar(120) NOT NULL,
        "valor" jsonb NOT NULL,
        "fonte_norma" varchar(200),
        "valid_from" timestamptz NOT NULL,
        "valid_to" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_tax_parameters_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    // Postgres trata NULL como distinto em UNIQUE — substituímos por um sentinel
    // implícito coalescendo company_id no índice composto para garantir idempotência.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_tax_parameters_scope_chave_from"
        ON "tax_parameters" (COALESCE("company_id", '00000000-0000-0000-0000-000000000000'), "chave", "valid_from")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tax_parameters_lookup"
        ON "tax_parameters"("chave", "valid_from", "valid_to")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tax_parameters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "beneficios_fiscais_uf"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "icms_st_mva"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "icms_interna_uf"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "interstate_aliquots"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_beneficio_enum"`);
  }
}

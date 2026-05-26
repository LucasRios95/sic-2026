import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration Fase 1b — EP-10: recepção de DF-e (NF-e/CT-e contra o CNPJ) +
 * EP-11: manifestação do destinatário.
 *
 * Reusa o enum `document_status_enum` da migration CreateNFeSchema. Cria 3 enums
 * novos (`tipo_dfe`, `received_doc_status`, `tipo_manifestacao`, `origem_captura`) e 4
 * tabelas (nsu_cursors, received_documents, received_document_versions, dfe_manifestations).
 */
export class CreateNFeRecepcaoSchema1716341600000 implements MigrationInterface {
  name = 'CreateNFeRecepcaoSchema1716341600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "tipo_dfe_enum" AS ENUM (
        'NFE_55', 'NFCE_65', 'NFSE_MUNICIPAL', 'NFSE_NACIONAL',
        'CTE_57', 'CTE_67_OS', 'MDFE_58', 'NFCOM', 'DCE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "received_doc_status_enum" AS ENUM (
        'PENDENTE', 'CONFERIDO', 'ESCRITURADO', 'DEVOLVIDO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "tipo_manifestacao_enum" AS ENUM (
        'CIENCIA_OPERACAO',
        'CONFIRMACAO_OPERACAO',
        'DESCONHECIMENTO_OPERACAO',
        'OPERACAO_NAO_REALIZADA'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "origem_captura_enum" AS ENUM (
        'sefaz_distribuicao', 'focus_nfsen', 'upload_xml', 'upload_pdf'
      )
    `);

    // --- NsuCursor ---
    await queryRunner.query(`
      CREATE TABLE "nsu_cursors" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "origem" varchar(30) NOT NULL,
        "cursor_value" varchar(30) NOT NULL DEFAULT '0',
        "last_fetched_at" timestamptz,
        "last_c_stat" varchar(10),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_nsu_cursors_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_nsu_cursors_company_origem"
        ON "nsu_cursors"("company_id", "origem")`,
    );

    // --- ReceivedDocument ---
    await queryRunner.query(`
      CREATE TABLE "received_documents" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "supplier_id" uuid,
        "tipo" "tipo_dfe_enum" NOT NULL,
        "chave_acesso" varchar(44),
        "numero" varchar(20),
        "serie" varchar(10),
        "emitente_cnpj" varchar(14) NOT NULL,
        "emitente_nome" varchar(200) NOT NULL,
        "emitente_uf" char(2),
        "dh_emissao" timestamptz NOT NULL,
        "valor_total" numeric(18,2) NOT NULL,
        "nsu" varchar(30),
        "versao_focus" varchar(30),
        "status" "received_doc_status_enum" NOT NULL DEFAULT 'PENDENTE',
        "resumo_xml" text,
        "xml_completo" text,
        "origem_captura" "origem_captura_enum" NOT NULL DEFAULT 'sefaz_distribuicao',
        "captured_at" timestamptz NOT NULL DEFAULT now(),
        "conferido_em" timestamptz,
        "conferido_by" uuid,
        "escriturado_em" timestamptz,
        "observacoes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_received_documents_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_received_documents_supplier"
          FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL
      )
    `);
    // Unique parcial: chave única só quando preenchida (alguns docs vêm sem chave).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_received_documents_company_chave"
        ON "received_documents"("company_id", "chave_acesso")
        WHERE "chave_acesso" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_received_documents_company_status"
        ON "received_documents"("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_received_documents_company_emissao"
        ON "received_documents"("company_id", "dh_emissao")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_received_documents_emitente"
        ON "received_documents"("emitente_cnpj")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_received_documents_nsu" ON "received_documents"("nsu")`,
    );

    // --- ReceivedDocumentVersion ---
    await queryRunner.query(`
      CREATE TABLE "received_document_versions" (
        "id" uuid PRIMARY KEY,
        "received_document_id" uuid NOT NULL,
        "versao" int NOT NULL,
        "tipo_mudanca" varchar(30) NOT NULL,
        "payload" jsonb NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_received_document_versions_doc"
          FOREIGN KEY ("received_document_id") REFERENCES "received_documents"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_received_document_versions_doc"
        ON "received_document_versions"("received_document_id")`,
    );

    // --- DfeManifestation ---
    await queryRunner.query(`
      CREATE TABLE "dfe_manifestations" (
        "id" uuid PRIMARY KEY,
        "received_document_id" uuid NOT NULL,
        "tipo" "tipo_manifestacao_enum" NOT NULL,
        "justificativa" text,
        "dh_evento" timestamptz NOT NULL,
        "status" "document_status_enum" NOT NULL DEFAULT 'PENDING',
        "protocolo" varchar(30),
        "c_stat" varchar(10),
        "x_motivo" varchar(300),
        "enviado_em" timestamptz,
        "retorno_xml" text,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_dfe_manifestations_doc"
          FOREIGN KEY ("received_document_id") REFERENCES "received_documents"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_dfe_manifestations_doc"
        ON "dfe_manifestations"("received_document_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dfe_manifestations_status"
        ON "dfe_manifestations"("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dfe_manifestations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "received_document_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "received_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nsu_cursors"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "origem_captura_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_manifestacao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "received_doc_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_dfe_enum"`);
  }
}

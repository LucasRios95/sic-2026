import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration EP-07: tabelas NF-e, NFeItem, NFeEvento, NFePagamento e NumberingSeries.
 *
 * Reusa os enums já criados nas migrations anteriores (companies_crt_enum,
 * companies_ambiente_sefaz_enum, cst_ibs_cbs_enum). Cria os enums novos específicos
 * do domínio NF-e (tipo_operacao, finalidade_nfe, forma_emissao, document_status,
 * tipo_evento_nfe).
 */
export class CreateNFeSchema1716341400000 implements MigrationInterface {
  name = 'CreateNFeSchema1716341400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Enums do domínio NF-e ---
    await queryRunner.query(`
      CREATE TYPE "tipo_operacao_enum" AS ENUM ('ENTRADA', 'SAIDA')
    `);
    await queryRunner.query(`
      CREATE TYPE "finalidade_nfe_enum" AS ENUM (
        'NORMAL', 'COMPLEMENTAR', 'AJUSTE', 'DEVOLUCAO', 'NOTA_CREDITO', 'NOTA_DEBITO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "forma_emissao_enum" AS ENUM (
        'NORMAL',
        'CONTINGENCIA_FSDA',
        'CONTINGENCIA_SCAN',
        'CONTINGENCIA_EPEC',
        'CONTINGENCIA_FSDA_OUTRA',
        'CONTINGENCIA_SVC_AN',
        'CONTINGENCIA_SVC_RS',
        'OFFLINE_NFCE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "document_status_enum" AS ENUM (
        'DRAFT', 'PENDING', 'SUBMITTED', 'PROCESSING', 'AUTHORIZED',
        'REJECTED', 'DENIED', 'CANCELLED', 'INUTILIZED', 'ERROR'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "tipo_evento_nfe_enum" AS ENUM (
        'CANCELAMENTO', 'CARTA_CORRECAO', 'EPEC',
        'CIENCIA_OPERACAO', 'CONFIRMACAO_OPERACAO', 'DESCONHECIMENTO',
        'OPERACAO_NAO_REALIZADA', 'ATOR_INTERESSADO', 'INSUCESSO_ENTREGA',
        'ECONF', 'COMPROVANTE_ENTREGA'
      )
    `);

    // --- NumberingSeries ---
    await queryRunner.query(`
      CREATE TABLE "numbering_series" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "modelo" varchar(2) NOT NULL,
        "serie" int NOT NULL,
        "proximo_numero" bigint NOT NULL,
        "ultimo_usado" bigint,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_numbering_series_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_numbering_series_scope"
        ON "numbering_series"("company_id", "modelo", "serie")`,
    );

    // --- NFe (tabela com muitos campos — espelha schema Prisma v1.3) ---
    await queryRunner.query(`
      CREATE TABLE "nfes" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "customer_id" uuid,
        "numero" bigint NOT NULL,
        "serie" int NOT NULL,
        "modelo" varchar(2) NOT NULL DEFAULT '55',
        "chave_acesso" varchar(44),
        "dh_emissao" timestamptz NOT NULL,
        "dh_sai_ent" timestamptz,
        "tipo_operacao" "tipo_operacao_enum" NOT NULL,
        "finalidade" "finalidade_nfe_enum" NOT NULL DEFAULT 'NORMAL',
        "natureza_operacao" varchar(60) NOT NULL,
        "ambiente" "companies_ambiente_sefaz_enum" NOT NULL,
        "forma_emissao" "forma_emissao_enum" NOT NULL DEFAULT 'NORMAL',
        "status" "document_status_enum" NOT NULL DEFAULT 'DRAFT',
        "idempotency_key" varchar(80) NOT NULL,
        "c_stat" varchar(10),
        "x_motivo" varchar(300),
        "protocolo_autorizacao" varchar(30),
        "dh_autorizacao" timestamptz,
        "n_prot_cancelamento" varchar(30),
        "dh_cancelamento" timestamptz,
        "valor_produtos" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_frete" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_seguro" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_desconto" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_outros" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_total" numeric(18,2) NOT NULL DEFAULT 0,
        "base_icms" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_icms" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_icms_deson" numeric(18,2) NOT NULL DEFAULT 0,
        "base_icms_st" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_icms_st" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_fcp" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_fcp_st" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_fcp_st_ret" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_icms_uf_dest" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_icms_uf_remet" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_fcp_uf_dest" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_ipi" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_pis" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_cofins" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_ii" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_tot_trib" numeric(18,2) NOT NULL DEFAULT 0,
        "base_ibs_cbs" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_ibs" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_cbs" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_is" numeric(18,2) NOT NULL DEFAULT 0,
        "operacao_interestadual" boolean NOT NULL DEFAULT false,
        "uf_destino" char(2),
        "xml_assinado" text,
        "xml_autorizado" text,
        "danfe_url" varchar(500),
        "inf_cpl" text,
        "inf_ad_fisco" text,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_nfes_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_nfes_customer"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_nfes_scope_numero"
        ON "nfes"("company_id", "modelo", "serie", "numero")`,
    );
    // Chave de acesso única quando preenchida (em contingência EPEC pode ficar nula).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_nfes_chave"
        ON "nfes"("chave_acesso") WHERE "chave_acesso" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_nfes_idempotency" ON "nfes"("idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_nfes_company_emissao" ON "nfes"("company_id", "dh_emissao")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_nfes_company_status" ON "nfes"("company_id", "status")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_nfes_customer" ON "nfes"("customer_id")`);

    // --- NFeItem ---
    await queryRunner.query(`
      CREATE TABLE "nfe_items" (
        "id" uuid PRIMARY KEY,
        "nfe_id" uuid NOT NULL,
        "product_id" uuid,
        "numero_item" int NOT NULL,
        "codigo" varchar(60) NOT NULL,
        "descricao" varchar(300) NOT NULL,
        "ncm" varchar(8) NOT NULL,
        "cest" varchar(7),
        "cfop" varchar(4) NOT NULL,
        "unidade_comercial" varchar(6) NOT NULL,
        "quantidade_comercial" numeric(15,4) NOT NULL,
        "valor_unitario" numeric(21,10) NOT NULL,
        "valor_total" numeric(18,2) NOT NULL,
        "valor_desconto" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_frete" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_seguro" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_outros" numeric(18,2) NOT NULL DEFAULT 0,
        "cst_icms" varchar(4),
        "csosn_icms" varchar(4),
        "origem_mercadoria" smallint,
        "mod_bc" smallint,
        "base_icms" numeric(18,2),
        "p_red_bc" numeric(7,4),
        "aliq_icms" numeric(7,4),
        "valor_icms" numeric(18,2),
        "c_benef" varchar(20),
        "mot_des_icms" smallint,
        "valor_icms_deson" numeric(18,2),
        "cst_icms_st" varchar(4),
        "mod_bc_st" smallint,
        "p_mvast" numeric(7,4),
        "base_icms_st" numeric(18,2),
        "aliq_icms_st" numeric(7,4),
        "valor_icms_st" numeric(18,2),
        "base_fcp" numeric(18,2),
        "p_fcp" numeric(7,4),
        "valor_fcp" numeric(18,2),
        "base_icms_uf_dest" numeric(18,2),
        "p_icms_uf_dest" numeric(7,4),
        "p_icms_inter" numeric(7,4),
        "valor_icms_uf_dest" numeric(18,2),
        "valor_icms_uf_remet" numeric(18,2),
        "base_fcp_uf_dest" numeric(18,2),
        "p_fcp_uf_dest" numeric(7,4),
        "valor_fcp_uf_dest" numeric(18,2),
        "cst_ipi" varchar(4),
        "c_enq" varchar(4),
        "base_ipi" numeric(18,2),
        "aliq_ipi" numeric(7,4),
        "valor_ipi" numeric(18,2),
        "cst_pis" varchar(4),
        "base_pis" numeric(18,2),
        "aliq_pis" numeric(7,4),
        "valor_pis" numeric(18,2),
        "cst_cofins" varchar(4),
        "base_cofins" numeric(18,2),
        "aliq_cofins" numeric(7,4),
        "valor_cofins" numeric(18,2),
        "cst_ibs_cbs" "cst_ibs_cbs_enum",
        "c_class_trib" varchar(10),
        "base_ibs_cbs" numeric(18,2),
        "aliq_ibs" numeric(7,4),
        "valor_ibs" numeric(18,2),
        "aliq_cbs" numeric(7,4),
        "valor_cbs" numeric(18,2),
        "cst_is" varchar(4),
        "aliq_is" numeric(7,4),
        "valor_is" numeric(18,2),
        "inf_ad_prod" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_nfe_items_nfe"
          FOREIGN KEY ("nfe_id") REFERENCES "nfes"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_nfe_items_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_nfe_items_nfe_numero" ON "nfe_items"("nfe_id", "numero_item")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_nfe_items_nfe" ON "nfe_items"("nfe_id")`);

    // --- NFeEvento ---
    await queryRunner.query(`
      CREATE TABLE "nfe_eventos" (
        "id" uuid PRIMARY KEY,
        "nfe_id" uuid NOT NULL,
        "tipo_evento" "tipo_evento_nfe_enum" NOT NULL,
        "sequencial" int NOT NULL DEFAULT 1,
        "dh_evento" timestamptz NOT NULL,
        "justificativa" text,
        "detalhe" jsonb,
        "protocolo" varchar(30),
        "c_stat" varchar(10),
        "x_motivo" varchar(300),
        "xml_evento" text,
        "xml_retorno" text,
        "status" "document_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_nfe_eventos_nfe"
          FOREIGN KEY ("nfe_id") REFERENCES "nfes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_nfe_eventos_scope"
        ON "nfe_eventos"("nfe_id", "tipo_evento", "sequencial")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_nfe_eventos_nfe" ON "nfe_eventos"("nfe_id")`);

    // --- NFePagamento ---
    await queryRunner.query(`
      CREATE TABLE "nfe_pagamentos" (
        "id" uuid PRIMARY KEY,
        "nfe_id" uuid NOT NULL,
        "meio" varchar(2) NOT NULL,
        "valor" numeric(18,2) NOT NULL,
        "bandeira" varchar(10),
        "cnpj_credenciadora" varchar(14),
        "numero_autorizacao" varchar(50),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_nfe_pagamentos_nfe"
          FOREIGN KEY ("nfe_id") REFERENCES "nfes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_nfe_pagamentos_nfe" ON "nfe_pagamentos"("nfe_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "nfe_pagamentos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nfe_eventos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nfe_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nfes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "numbering_series"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_evento_nfe_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "document_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "forma_emissao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "finalidade_nfe_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_operacao_enum"`);
  }
}

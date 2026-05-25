import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration do EP-03: cadastros base (Customer, Supplier, Product, Service) e suas
 * regras tributárias versionadas (ProductTaxRule, ServiceTaxRule). Esses dados são a
 * fundação consumida pelo motor tributário (EP-04) e pela emissão fiscal (Fase 1a).
 */
export class CreateCatalogSchema1716341000000 implements MigrationInterface {
  name = 'CreateCatalogSchema1716341000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Enums fiscais compartilhados ---
    await queryRunner.query(`
      CREATE TYPE "tipo_pessoa_enum" AS ENUM ('PF', 'PJ', 'ESTRANGEIRO')
    `);
    await queryRunner.query(`
      CREATE TYPE "indicador_ie_enum" AS ENUM ('CONTRIBUINTE', 'ISENTO', 'NAO_CONTRIBUINTE')
    `);
    await queryRunner.query(`
      CREATE TYPE "cst_ibs_cbs_enum" AS ENUM (
        'TRIBUTACAO_INTEGRAL', 'REDUCAO_ALIQUOTA', 'REDUCAO_BASE_CALCULO',
        'DIFERIMENTO', 'SUSPENSAO', 'ISENCAO', 'IMUNIDADE',
        'NAO_INCIDENCIA', 'CREDITO_PRESUMIDO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "tipo_retencao_iss_enum" AS ENUM (
        'SEM_RETENCAO', 'RETIDO_TOMADOR', 'RETIDO_INTERMEDIARIO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "indicador_op_nfse_enum" AS ENUM (
        'TRIBUTADO', 'ALIQUOTA_ZERO', 'IMUNE', 'ISENTO_NFSE', 'NAO_INCIDENCIA_NFSE'
      )
    `);

    // --- Customer ---
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "tipo_pessoa" "tipo_pessoa_enum" NOT NULL,
        "cnpj_cpf" varchar(20) NOT NULL,
        "nome_razao" varchar(200) NOT NULL,
        "nome_fantasia" varchar(200),
        "ie" varchar(20),
        "indicador_ie" "indicador_ie_enum" NOT NULL,
        "im" varchar(20),
        "suframa" varchar(20),
        "email" varchar(150),
        "telefone" varchar(20),
        "crt_destinatario" "companies_crt_enum",
        "consumidor_final" boolean NOT NULL DEFAULT false,
        "indicador_presenca" smallint,
        "logradouro" varchar(200) NOT NULL,
        "numero" varchar(20) NOT NULL,
        "complemento" varchar(100),
        "bairro" varchar(100) NOT NULL,
        "codigo_municipio_ibge" varchar(7) NOT NULL,
        "municipio" varchar(100) NOT NULL,
        "uf" char(2) NOT NULL,
        "cep" varchar(8) NOT NULL,
        "pais" varchar(60) NOT NULL DEFAULT 'Brasil',
        "codigo_pais" varchar(4) NOT NULL DEFAULT '1058',
        "limite_credito" numeric(18,2),
        "bloqueado" boolean NOT NULL DEFAULT false,
        "active" boolean NOT NULL DEFAULT true,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_customers_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_customers_company_cnpj_cpf" ON "customers"("company_id", "cnpj_cpf")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_customers_company_nome" ON "customers"("company_id", "nome_razao")`,
    );

    // --- Supplier ---
    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "tipo_pessoa" "tipo_pessoa_enum" NOT NULL,
        "cnpj_cpf" varchar(20) NOT NULL,
        "nome_razao" varchar(200) NOT NULL,
        "nome_fantasia" varchar(200),
        "ie" varchar(20),
        "indicador_ie" "indicador_ie_enum" NOT NULL,
        "crt_fornecedor" "companies_crt_enum",
        "produtor_rural" boolean NOT NULL DEFAULT false,
        "email" varchar(150),
        "telefone" varchar(20),
        "logradouro" varchar(200) NOT NULL,
        "numero" varchar(20) NOT NULL,
        "complemento" varchar(100),
        "bairro" varchar(100) NOT NULL,
        "codigo_municipio_ibge" varchar(7) NOT NULL,
        "municipio" varchar(100) NOT NULL,
        "uf" char(2) NOT NULL,
        "cep" varchar(8) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_suppliers_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_suppliers_company_cnpj_cpf" ON "suppliers"("company_id", "cnpj_cpf")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_suppliers_company_nome" ON "suppliers"("company_id", "nome_razao")`,
    );

    // --- Product ---
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "codigo" varchar(60) NOT NULL,
        "codigo_barras" varchar(14),
        "descricao" varchar(300) NOT NULL,
        "ncm" varchar(8) NOT NULL,
        "cest" varchar(7),
        "origem" smallint NOT NULL,
        "unidade_comercial" varchar(6) NOT NULL,
        "unidade_tributavel" varchar(6) NOT NULL,
        "peso_liquido" numeric(15,3),
        "peso_bruto" numeric(15,3),
        "controla_estoque" boolean NOT NULL DEFAULT true,
        "estoque_atual" numeric(15,3) NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_products_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_products_company_codigo" ON "products"("company_id", "codigo")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_company_ncm" ON "products"("company_id", "ncm")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_products_codigo_barras" ON "products"("codigo_barras")`);

    // --- ProductTaxRule ---
    await queryRunner.query(`
      CREATE TABLE "product_tax_rules" (
        "id" uuid PRIMARY KEY,
        "product_id" uuid NOT NULL,
        "cst_icms" varchar(4),
        "csosn_icms" varchar(4),
        "aliq_icms" numeric(7,4),
        "mod_bc" smallint,
        "p_red_bc" numeric(7,4),
        "importado" boolean NOT NULL DEFAULT false,
        "cst_icms_st" varchar(4),
        "mod_bc_st" smallint,
        "p_mvast" numeric(7,4),
        "p_red_bc_st" numeric(7,4),
        "p_icmsst" numeric(7,4),
        "p_icms_efetivo" numeric(7,4),
        "mot_des_icms" smallint,
        "p_fcp" numeric(7,4),
        "p_fcpst" numeric(7,4),
        "p_fcpst_ret" numeric(7,4),
        "cst_ipi" varchar(4),
        "c_enq" varchar(4),
        "aliq_ipi" numeric(7,4),
        "ipi_por_unidade" boolean NOT NULL DEFAULT false,
        "v_unid_ipi" numeric(15,4),
        "cst_pis" varchar(4),
        "aliq_pis" numeric(7,4),
        "cst_cofins" varchar(4),
        "aliq_cofins" numeric(7,4),
        "pis_cofins_por_unidade" boolean NOT NULL DEFAULT false,
        "v_unid_pis" numeric(15,4),
        "v_unid_cofins" numeric(15,4),
        "cst_ibs_cbs" "cst_ibs_cbs_enum",
        "c_class_trib" varchar(10),
        "aliq_ibs_produto" numeric(7,4),
        "aliq_cbs_produto" numeric(7,4),
        "cst_is" varchar(4),
        "aliq_is" numeric(7,4),
        "incidencia_is" boolean NOT NULL DEFAULT false,
        "valid_from" timestamptz NOT NULL,
        "valid_to" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_product_tax_rules_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_product_tax_rules_product_validity" ON "product_tax_rules"("product_id", "valid_from", "valid_to")`,
    );
    // Performance da consulta "regra vigente em D": índice parcial cobrindo o caminho ativo.
    await queryRunner.query(
      `CREATE INDEX "idx_product_tax_rules_open_window"
       ON "product_tax_rules"("product_id", "valid_from") WHERE "valid_to" IS NULL`,
    );

    // --- Service ---
    await queryRunner.query(`
      CREATE TABLE "services" (
        "id" uuid PRIMARY KEY,
        "company_id" uuid NOT NULL,
        "codigo" varchar(60) NOT NULL,
        "descricao" varchar(300) NOT NULL,
        "codigo_tributacao_nacional" varchar(10),
        "item_lista_servico" varchar(10) NOT NULL,
        "codigo_tributacao_municipal" varchar(20),
        "cnae" varchar(7),
        "active" boolean NOT NULL DEFAULT true,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_services_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_services_company_codigo" ON "services"("company_id", "codigo")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_services_company_item" ON "services"("company_id", "item_lista_servico")`,
    );

    // --- ServiceTaxRule ---
    await queryRunner.query(`
      CREATE TABLE "service_tax_rules" (
        "id" uuid PRIMARY KEY,
        "service_id" uuid NOT NULL,
        "cst_iss" varchar(4),
        "aliq_iss" numeric(7,4),
        "tipo_retencao" "tipo_retencao_iss_enum" NOT NULL DEFAULT 'SEM_RETENCAO',
        "cst_ibs_cbs" "cst_ibs_cbs_enum",
        "c_class_trib" varchar(10),
        "c_ind_op" "indicador_op_nfse_enum",
        "cst_pis" varchar(4),
        "cst_cofins" varchar(4),
        "retem_pis_cofins" boolean NOT NULL DEFAULT false,
        "retem_csll" boolean NOT NULL DEFAULT false,
        "retem_inss" boolean NOT NULL DEFAULT false,
        "retem_ir" boolean NOT NULL DEFAULT false,
        "valid_from" timestamptz NOT NULL,
        "valid_to" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_service_tax_rules_service"
          FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_service_tax_rules_service_validity" ON "service_tax_rules"("service_id", "valid_from", "valid_to")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "service_tax_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_tax_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "indicador_op_nfse_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_retencao_iss_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cst_ibs_cbs_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "indicador_ie_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_pessoa_enum"`);
  }
}

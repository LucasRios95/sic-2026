import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Acelera buscas textuais (ILIKE) nas tabelas grandes e habilita match
 * insensível a acentos.
 *
 * Decisões:
 *  - `pg_trgm` + GIN trigram index: transforma ILIKE '%termo%' de seq scan O(n)
 *    em index scan. Performance crítica em customers (5k+) e products (pode
 *    chegar a milhares quando o cliente operar várias linhas).
 *  - `unaccent` como função IMMUTABLE wrapper: o `unaccent()` nativo é STABLE,
 *    o que impede uso direto em índice. Criamos `f_unaccent` IMMUTABLE
 *    (chama o original) e usamos esse no índice expression — padrão consagrado
 *    em apps Postgres com normalização de acento.
 *  - Índice por expressão `f_unaccent(lower(coluna))` casa com o ILIKE escrito
 *    como `f_unaccent(lower(coluna)) LIKE f_unaccent(lower(:term))` no repo.
 *
 * Trade-off: índices GIN ocupam mais disco que B-tree e têm INSERT/UPDATE
 * marginalmente mais lentos. Aceitável aqui — leituras dominam.
 */
export class AddSearchIndexes1716342100000 implements MigrationInterface {
  name = 'AddSearchIndexes1716342100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);

    // Wrapper IMMUTABLE para permitir uso em índices. `unaccent()` nativo é STABLE.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION f_unaccent(text)
      RETURNS text AS $$
        SELECT public.unaccent('public.unaccent', $1)
      $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE
    `);

    // === customers ===
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_nome_razao_trgm
      ON customers USING gin (f_unaccent(lower(nome_razao)) gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_cnpj_cpf_trgm
      ON customers USING gin (cnpj_cpf gin_trgm_ops)
    `);

    // === products ===
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_products_descricao_trgm
      ON products USING gin (f_unaccent(lower(descricao)) gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_products_codigo_trgm
      ON products USING gin (lower(codigo) gin_trgm_ops)
    `);

    // === suppliers ===
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_suppliers_nome_razao_trgm
      ON suppliers USING gin (f_unaccent(lower(nome_razao)) gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj_cpf_trgm
      ON suppliers USING gin (cnpj_cpf gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_suppliers_cnpj_cpf_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_suppliers_nome_razao_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_codigo_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_descricao_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_customers_cnpj_cpf_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_customers_nome_razao_trgm`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS f_unaccent(text)`);
    // Extensões ficam (podem ser usadas por outras migrations futuras).
  }
}

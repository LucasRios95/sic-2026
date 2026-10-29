import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: remove o prefixo `LEG-` dos códigos de produto.
 *
 * Os importadores do sistema legado (`import:legacy` e `import:canguera`) gravavam
 * o código como `LEG-<id legado>` para evitar colisão com cadastros novos. O efeito
 * colateral é que esse prefixo vai parar no `cProd` da NF-e, e os sistemas contábeis
 * não conseguem casar o produto com o cadastro deles na importação do XML —
 * o que gera divergência de estoque.
 *
 * O código legado (`tab_produto.PK_CODPRODUTO` / `CPROD`) já é o identificador que
 * a contabilidade espera, então basta remover o prefixo.
 *
 * Segurança: a linha só é atualizada se o código sem prefixo ainda não existir na
 * mesma empresa (o índice `uq_products_company_codigo` é único por company+codigo e
 * inclui os soft-deletados). Nenhuma colisão foi observada em produção, mas o guard
 * evita quebrar a migration em bases futuras.
 *
 * `nfe_items.codigo` NÃO é alterado de propósito: é o snapshot do que foi
 * efetivamente transmitido no XML autorizado pela SEFAZ e precisa continuar
 * batendo com ele.
 */
export class RemoveLegacyProductCodePrefix1716342400000 implements MigrationInterface {
  name = 'RemoveLegacyProductCodePrefix1716342400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products" p
      SET "codigo" = regexp_replace(p."codigo", '^LEG-', ''),
          "updated_at" = now()
      WHERE p."codigo" LIKE 'LEG-%'
        AND regexp_replace(p."codigo", '^LEG-', '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM "products" q
          WHERE q."company_id" = p."company_id"
            AND q."codigo" = regexp_replace(p."codigo", '^LEG-', '')
            AND q."id" <> p."id"
        )
    `);
  }

  public async down(): Promise<void> {
    // Irreversível: depois do UPDATE não há como distinguir um código que veio do
    // legado (e tinha o prefixo) de um cadastrado manualmente com o mesmo formato.
    // Reaplicar `LEG-` em tudo corromperia os cadastros novos.
  }
}

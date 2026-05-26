import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona `cfop_padrao_saida` e `cfop_padrao_entrada` à tabela `products`.
 *
 * Esses campos servem de sugestão padrão no formulário de emissão da NF-e:
 *  - Venda interna (mesma UF do destinatário) → usa `cfop_padrao_saida`.
 *  - Venda interestadual → troca o primeiro dígito de 5 → 6 automaticamente.
 *  - Compra interna → usa `cfop_padrao_entrada`. Compra interestadual: 1 → 2.
 *
 * O catálogo CFOP (criado em migration anterior) é fonte de verdade — esses campos
 * só armazenam o código (FK lógica, sem constraint para permitir produto antigo
 * que tenha CFOP que mais tarde foi removido).
 */
export class AddProductCfopDefaults1716342000000 implements MigrationInterface {
  name = 'AddProductCfopDefaults1716342000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products"
         ADD COLUMN "cfop_padrao_saida" char(4),
         ADD COLUMN "cfop_padrao_entrada" char(4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products"
         DROP COLUMN "cfop_padrao_entrada",
         DROP COLUMN "cfop_padrao_saida"`,
    );
  }
}

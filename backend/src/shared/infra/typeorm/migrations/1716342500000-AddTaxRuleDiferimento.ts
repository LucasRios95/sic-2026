import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: percentual de diferimento do ICMS na regra tributária do produto.
 *
 *  - product_tax_rules.p_dif → % do ICMS da operação que fica diferido no CST 51
 *    (100 = diferimento total). O motor apura vICMSOp, vICMSDif e vICMS = vICMSOp − vICMSDif,
 *    que vão no grupo ICMS51 do XML. Nulo = sem diferimento (ICMS integral, com aviso).
 */
export class AddTaxRuleDiferimento1716342500000 implements MigrationInterface {
  name = 'AddTaxRuleDiferimento1716342500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_tax_rules" ADD COLUMN IF NOT EXISTS "p_dif" numeric(7,4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_tax_rules" DROP COLUMN IF EXISTS "p_dif"`);
  }
}

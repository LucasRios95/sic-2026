import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: informações adicionais de endereço do cliente + logo da empresa.
 *
 *  - customers.ponto_referencia → ponto de referência do endereço; anexado ao infCpl da NF-e.
 *  - customers.observacoes      → observações livres; anexadas ao infCpl da NF-e.
 *    (complemento já existia — é o "apartamento/sala" que vai no xCpl do endereço.)
 *  - companies.logo             → data URI da imagem do logo, renderizado no canto superior
 *    esquerdo da DANFE quando presente.
 */
export class AddCustomerAddressInfoAndCompanyLogo1716342300000
  implements MigrationInterface
{
  name = 'AddCustomerAddressInfoAndCompanyLogo1716342300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "ponto_referencia" varchar(150)`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "observacoes" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "logo" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN IF EXISTS "logo"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "observacoes"`);
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN IF EXISTS "ponto_referencia"`,
    );
  }
}

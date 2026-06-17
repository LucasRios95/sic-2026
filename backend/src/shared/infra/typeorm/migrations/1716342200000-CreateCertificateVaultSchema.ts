import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: cofre de certificados no banco (driver VAULT_DRIVER=db).
 *
 * Guarda o payload cifrado (AES-256-GCM) do certificado A1 numa coluna jsonb. Usado em
 * deploys de nuvem (Railway) onde o filesystem é efêmero e volumes não são compartilháveis
 * entre serviços — assim backend e worker acessam o mesmo cofre via Postgres.
 *
 * O conteúdo é cifrado pela VAULT_MASTER_KEY antes de chegar aqui (ver PostgresCertificateVault
 * + vaultCrypto); o banco nunca vê a chave nem o PFX em claro.
 */
export class CreateCertificateVaultSchema1716342200000 implements MigrationInterface {
  name = 'CreateCertificateVaultSchema1716342200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "certificate_vault_entries" (
        "vault_ref" text PRIMARY KEY,
        "payload" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "certificate_vault_entries"`);
  }
}

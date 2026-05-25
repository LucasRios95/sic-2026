import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

export enum CertificateType {
  A1 = 'A1',
  A3 = 'A3',
}

/**
 * Registro de certificado digital da empresa. O conteúdo BRUTO do PFX NUNCA é
 * persistido aqui — apenas a referência opaca `vaultRef` (string que aponta para o
 * cofre via ICertificateVault). PRD SEF-03/SEF-04, RNF-10.
 *
 * Por que separar metadata em banco e bytes no cofre:
 *  - Permite listar/expirar/auditar sem acesso ao segredo.
 *  - Permite trocar a backend de cofre (memória → filesystem → HashiCorp Vault → KMS)
 *    sem mexer na tabela de certificados.
 *  - Vazamento da tabela `certificates` não compromete os certificados — só o cofre
 *    custodia o conteúdo cifrado.
 *
 * Política de unicidade: uma empresa pode ter VÁRIOS certificados (rotação anual ou
 * múltiplas filiais com certificados próprios), mas só UM ativo por vez por filial
 * — controlado via flag `active`. O resolver para emissão escolhe o ativo com
 * `validTo` mais distante (renovação aceita um novo cert antes do antigo expirar).
 */
@Entity('certificates')
@Index('idx_certificates_company_active', ['companyId', 'active'])
@Index('idx_certificates_valid_to', ['validTo'])
@Index('uq_certificates_thumbprint', ['thumbprint'], { unique: true })
export class Certificate extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ type: 'varchar', length: 100 })
  alias!: string;

  @Column({ type: 'enum', enum: CertificateType, default: CertificateType.A1 })
  tipo!: CertificateType;

  /** Subject completo (CN, OU, O…) extraído do certificado. */
  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  /** CN parseado isoladamente — útil para apresentação simples ("Nome:CNPJ"). */
  @Column({ name: 'common_name', type: 'varchar', length: 200 })
  commonName!: string;

  /** CNPJ extraído do CN (sufixo numérico após `:`). Útil para validar match com Company.cnpj. */
  @Column({ name: 'cnpj_titular', type: 'varchar', length: 14, nullable: true })
  cnpjTitular?: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 80 })
  serialNumber!: string;

  /**
   * SHA-1 do certificado (fingerprint). Único globalmente — impede que duas empresas
   * subam o mesmo PFX por engano. Em produção: alerta o operador, em vez de aceitar
   * silenciosamente compartilhamento de certificado.
   */
  @Column({ type: 'varchar', length: 64 })
  thumbprint!: string;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz' })
  validTo!: Date;

  /** Referência opaca ao cofre. Esquema: `<driver>:<id>` (ex.: `fs:0193ab...`, `mem:...`). */
  @Column({ name: 'vault_ref', type: 'varchar', length: 200 })
  vaultRef!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;
}

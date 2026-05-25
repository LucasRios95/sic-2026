/**
 * Cofre de segredos para custódia de certificados digitais (e-CNPJ A1/A3), tokens da
 * Focus NF-e, credenciais bancárias e outros dados sensíveis (PRD SEF-03/04, RNF-10).
 *
 * Implementações:
 *  - InMemoryCertificateVault     — somente para testes; perde tudo no restart.
 *  - FileSystemCertificateVault   — persiste em disco criptografado com VAULT_MASTER_KEY
 *                                    (dev/homologação).
 *  - (Futuro) HashiCorpVault / AwsSecretsManager — produção.
 *
 * Princípios:
 *  - O conteúdo bruto do segredo NUNCA é persistido em banco. Apenas a referência
 *    opaca (vaultRef) é guardada em `certificates.vault_ref` / `integration_credentials.vault_ref`.
 *  - Cada acesso ao cofre deve ser auditado (chamador é responsável por registrar
 *    no AuditLog quem leu qual certificado para qual operação).
 *  - A chave-mestra de criptografia vive em variável de ambiente; em produção, virá
 *    de KMS ou do próprio cofre externo.
 */

export interface CertificateMetadata {
  alias: string;
  type: 'A1' | 'A3';
  subject: string;
  serialNumber: string;
  thumbprint: string;
  validFrom: Date;
  validTo: Date;
}

export interface StoredCertificate {
  vaultRef: string;
  metadata: CertificateMetadata;
}

export interface RetrievedCertificate {
  metadata: CertificateMetadata;
  /** Conteúdo PKCS#12 do certificado. NUNCA logue, persista em arquivo ou serialize na resposta. */
  content: Buffer;
  /** Senha original do certificado. Mesma regra de privacidade. */
  password: string;
}

export interface ICertificateVault {
  /**
   * Persiste um certificado A1 (PFX/PKCS#12) e devolve a referência opaca (`vaultRef`)
   * para guardar na tabela `certificates`.
   */
  store(input: {
    metadata: CertificateMetadata;
    content: Buffer;
    password: string;
  }): Promise<StoredCertificate>;

  retrieve(vaultRef: string): Promise<RetrievedCertificate>;

  revoke(vaultRef: string): Promise<void>;

  /** Lista metadados (sem conteúdo). Para painéis administrativos / alertas de expiração. */
  list(): Promise<StoredCertificate[]>;
}

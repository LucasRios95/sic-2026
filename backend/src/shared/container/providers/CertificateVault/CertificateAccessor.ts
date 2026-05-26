import { inject, injectable } from 'tsyringe';

import { ICertificateRepository } from '@modules/Certificates/repositories/ICertificateRepository';
import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { ICertificateVault, RetrievedCertificate } from './ICertificateVault';

/**
 * Camada de acesso ao cofre que aceita o identificador PÚBLICO do certificado
 * (Certificate.id, UUID) emitido pelo frontend. O `vaultRef` interno nunca é exposto
 * na API (`ListCertificatesController` o remove da resposta); por isso o frontend
 * só consegue mandar o `id`. Aqui resolvemos id → vault_ref antes de chamar o
 * cofre. Suporta também receber um vaultRef já prefixado (`fs:`, `mem:`) para que
 * código interno que já tem o ref possa chamar direto.
 *
 * Use este serviço SEMPRE que precisar do conteúdo de um certificado para emissão/
 * eventos fiscais. Acessar o ICertificateVault diretamente fica reservado para o
 * fluxo de upload/revogação (Certificates module).
 */
@injectable()
export class CertificateAccessor {
  constructor(
    @inject('CertificateRepository')
    private readonly certificates: ICertificateRepository,
    @inject('CertificateVault')
    private readonly vault: ICertificateVault,
  ) {}

  async retrieve(companyId: string, publicIdOrVaultRef: string): Promise<RetrievedCertificate> {
    const vaultRef = await this.resolveRef(companyId, publicIdOrVaultRef);
    return this.vault.retrieve(vaultRef);
  }

  /**
   * Converte o identificador recebido na request em vault_ref interno.
   *  - String com prefixo `fs:` ou `mem:` é tratada como vaultRef cru (chamadas internas).
   *  - Caso contrário, busca o Certificate por id dentro do companyId e devolve seu vaultRef.
   *  - Certificado inexistente, de outra empresa ou revogado → erro de negócio.
   */
  async resolveRef(companyId: string, publicIdOrVaultRef: string): Promise<string> {
    if (publicIdOrVaultRef.startsWith('fs:') || publicIdOrVaultRef.startsWith('mem:')) {
      return publicIdOrVaultRef;
    }
    const cert = await this.certificates.findById(companyId, publicIdOrVaultRef);
    if (!cert) {
      throw new NotFoundError(
        `Certificado ${publicIdOrVaultRef} não encontrado para esta empresa`,
      );
    }
    if (!cert.active || cert.revokedAt) {
      throw new BusinessRuleError(
        'Certificado revogado — emita um novo upload no menu de Certificados',
        'CERTIFICATE_REVOKED',
      );
    }
    return cert.vaultRef;
  }
}

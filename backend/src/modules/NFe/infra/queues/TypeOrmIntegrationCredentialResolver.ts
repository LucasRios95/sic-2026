import { inject, injectable } from 'tsyringe';

import { ICertificateRepository } from '@modules/Certificates/repositories/ICertificateRepository';

import { IIntegrationCredentialResolver } from './IIntegrationCredentialResolver';

/**
 * Implementação definitiva do resolver — consulta a entidade `Certificate` modelada
 * no EP-06b. Substitui o `InMemoryIntegrationCredentialResolver` no processo de workers.
 *
 * Estratégia: para cada empresa, devolve o `vaultRef` do certificado ATIVO vigente
 * com a janela de validade mais distante. Quando não há cert válido, retorna null —
 * o worker pula a NFe com warning (problema de configuração, não de fluxo fiscal).
 */
@injectable()
export class TypeOrmIntegrationCredentialResolver
  implements IIntegrationCredentialResolver
{
  constructor(
    @inject('CertificateRepository')
    private readonly certificateRepository: ICertificateRepository,
  ) {}

  async resolveCertificateRef(companyId: string): Promise<string | null> {
    const cert = await this.certificateRepository.findActiveForCompany(companyId);
    return cert?.vaultRef ?? null;
  }
}

import { injectable } from 'tsyringe';

import { IIntegrationCredentialResolver } from './IIntegrationCredentialResolver';

/**
 * Implementação stop-gap até o EP-06b modelar a entidade `Certificate` por completo.
 * Aceita um mapa `companyId → vaultRef` registrado em runtime (ex.: pelo onboarding
 * de empresa). Mantém os refs em memória — ao reiniciar, precisa reabastecer.
 *
 * Em produção: substituir por `TypeOrmIntegrationCredentialResolver` que consulta
 * `certificates WHERE company_id = ? AND active = true ORDER BY valid_to DESC LIMIT 1`.
 */
@injectable()
export class InMemoryIntegrationCredentialResolver
  implements IIntegrationCredentialResolver
{
  private readonly registry = new Map<string, string>();

  register(companyId: string, vaultRef: string): void {
    this.registry.set(companyId, vaultRef);
  }

  async resolveCertificateRef(companyId: string): Promise<string | null> {
    return this.registry.get(companyId) ?? null;
  }
}

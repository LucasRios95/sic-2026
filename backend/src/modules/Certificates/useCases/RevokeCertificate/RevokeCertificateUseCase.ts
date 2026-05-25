import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICertificateVault } from '@shared/container/providers/CertificateVault/ICertificateVault';
import { BusinessRuleError, NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

import { ICertificateRepository } from '../../repositories/ICertificateRepository';

interface IRequest {
  companyId: string;
  certificateId: string;
  userId: string;
  /** Quando true, remove o conteúdo do cofre. Default true. Em produção, sempre true. */
  removeFromVault?: boolean;
}

/**
 * Revoga um certificado registrado. Marca `active = false` + `revoked_at` no banco;
 * por padrão remove o conteúdo do cofre (não dá mais para emitir com ele).
 *
 * Operação IRREVERSÍVEL na prática — se precisar voltar, é mais barato re-uploadar o
 * mesmo PFX. Por isso requer `nfe.cancel` ou `admin.full` para autorizar.
 */
@injectable()
export class RevokeCertificateUseCase {
  constructor(
    @inject('CertificateRepository')
    private readonly repo: ICertificateRepository,

    @inject('CertificateVault')
    private readonly vault: ICertificateVault,

    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute(request: IRequest): Promise<void> {
    const cert = await this.repo.findById(request.companyId, request.certificateId);
    if (!cert) throw new NotFoundError('Certificado não encontrado');
    if (!cert.active) {
      throw new BusinessRuleError(
        'Certificado já está revogado',
        'CERTIFICATE_ALREADY_REVOKED',
      );
    }

    // Marca no banco PRIMEIRO. Se falhar aqui, não tocamos o cofre.
    await this.repo.revoke(cert.id, request.userId);

    if (request.removeFromVault !== false) {
      try {
        await this.vault.revoke(cert.vaultRef);
      } catch (err) {
        // Cofre indisponível não desfaz a revogação no banco — o registro fica como
        // revogado e o operador trata o cofre depois. Caso pior: o conteúdo cifrado
        // continua lá até a próxima rotina de limpeza.
        logger.warn(
          { err, certificateId: cert.id },
          'Falha ao revogar conteúdo no cofre; registro no banco permanece revogado',
        );
      }
    }

    await this.audit.record({
      action: 'certificate.revoke',
      entityType: 'certificate',
      entityId: cert.id,
      payload: {
        alias: cert.alias,
        thumbprint: cert.thumbprint,
        removedFromVault: request.removeFromVault !== false,
      },
    });
  }
}

import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICertificateVault } from '@shared/container/providers/CertificateVault/ICertificateVault';
import { NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

import { ICertificateRepository } from '../../repositories/ICertificateRepository';

interface IRequest {
  companyId: string;
  certificateId: string;
}

/**
 * Exclui DEFINITIVAMENTE um certificado (hard delete) — remove a linha de `certificates`
 * e purga o conteúdo cifrado do cofre. Diferente do Revoke (que mantém a linha como
 * "revogado" para histórico). Usado quando o operador quer limpar um certificado errado
 * ou substituir por outro sem deixar resíduo na lista.
 *
 * Seguro do ponto de vista referencial: NF-e não tem FK para certificado (o `vaultRef`
 * usado na emissão não é persistido na nota). A trilha de auditoria do que foi assinado
 * fica nas próprias NF-e + no audit log, independente desta tabela.
 */
@injectable()
export class DeleteCertificateUseCase {
  constructor(
    @inject('CertificateRepository')
    private readonly repo: ICertificateRepository,

    @inject('CertificateVault')
    private readonly vault: ICertificateVault,

    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute({ companyId, certificateId }: IRequest): Promise<void> {
    const cert = await this.repo.findById(companyId, certificateId);
    if (!cert) throw new NotFoundError('Certificado não encontrado');

    // Purga o conteúdo do cofre ANTES de apagar a linha. Best-effort: se o cofre
    // falhar, ainda removemos a linha (o segredo cifrado vira órfão para a limpeza).
    try {
      await this.vault.revoke(cert.vaultRef);
    } catch (err) {
      logger.warn(
        { err, certificateId: cert.id },
        'Falha ao purgar conteúdo no cofre durante exclusão; removendo a linha mesmo assim',
      );
    }

    await this.repo.delete(companyId, certificateId);

    await this.audit.record({
      action: 'certificate.delete',
      entityType: 'certificate',
      entityId: cert.id,
      payload: { alias: cert.alias, thumbprint: cert.thumbprint },
    });
  }
}

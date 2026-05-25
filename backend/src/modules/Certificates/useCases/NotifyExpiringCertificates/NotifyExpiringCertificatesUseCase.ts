import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { logger } from '@shared/logger';

import { ICertificateRepository } from '../../repositories/ICertificateRepository';

interface IResponse {
  examined: number;
  notified: number;
}

/**
 * Varre certificados ativos cuja validade está próxima do fim e dispara notificações
 * para a empresa — chamado pelo worker diário.
 *
 * Política de aviso (PRD SEF-04):
 *  - 60 dias antes: aviso `warn` (verde-amarelo — tempo confortável para renovar).
 *  - 30 dias antes: aviso `warn` repetido com tom mais urgente.
 *  - 7 dias antes: aviso `error` — bloqueia operação fiscal se não renovar.
 *
 * Idempotência: a notificação é categorizada como `certificate.expiring.<faixa>`,
 * o que permite ao frontend deduplicar visualmente. Não persistimos estado "já notifiquei
 * desse dia" — confiamos que o usuário marca como lida ou silencia. Para evitar SPAM
 * diário, o worker poderia consultar Notification existente com mesma categoria nas
 * últimas 24h e pular — fica como pequena evolução.
 */
@injectable()
export class NotifyExpiringCertificatesUseCase {
  constructor(
    @inject('CertificateRepository')
    private readonly repo: ICertificateRepository,

    @inject(NotificationService)
    private readonly notifications: NotificationService,

    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute(): Promise<IResponse> {
    const expiring = await this.repo.listExpiring(60);
    logger.info({ count: expiring.length }, 'Varredura de certificados a expirar');

    let notified = 0;
    for (const cert of expiring) {
      const daysLeft = Math.floor(
        (cert.validTo.getTime() - Date.now()) / 86_400_000,
      );
      const severity =
        daysLeft <= 7 ? 'error' : daysLeft <= 30 ? 'warn' : 'info';
      const category =
        daysLeft <= 7
          ? 'certificate.expiring.urgent'
          : daysLeft <= 30
            ? 'certificate.expiring.soon'
            : 'certificate.expiring.heads-up';

      const result = await this.notifications.notify({
        companyId: cert.companyId,
        category,
        title: `Certificado ${cert.alias} expira em ${daysLeft} dia(s)`,
        message:
          daysLeft <= 7
            ? `URGENTE: a partir de ${cert.validTo.toISOString().slice(0, 10)} a emissão fiscal vai parar. Renove com a AC.`
            : `Renove com a AC ICP-Brasil antes do vencimento para evitar interrupção da emissão fiscal.`,
        severity: severity as 'info' | 'warn' | 'error',
      });

      if (result) notified += 1;
    }

    await this.audit.record({
      action: 'certificate.expiry-check',
      entityType: 'certificate',
      payload: { examined: expiring.length, notified },
    });

    return { examined: expiring.length, notified };
  }
}

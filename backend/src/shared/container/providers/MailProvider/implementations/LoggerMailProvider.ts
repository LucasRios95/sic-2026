import { v7 as uuidv7 } from 'uuid';

import { logger } from '@shared/logger';

import { IMailProvider, MailMessage } from '../IMailProvider';

/**
 * Adapter de e-mail que apenas LOGA o envio — usado em dev quando `MAIL_HOST` não está
 * configurado e em testes. Não envia mensagem real; preserva os dados em log estruturado
 * para inspeção.
 */
export class LoggerMailProvider implements IMailProvider {
  async send(message: MailMessage): Promise<{ messageId: string }> {
    const messageId = `log-${uuidv7()}`;
    logger.info(
      {
        messageId,
        to: message.to,
        subject: message.subject,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.content.length,
        })),
      },
      'E-mail "enviado" via LoggerMailProvider (MAIL_HOST não configurado)',
    );
    return { messageId };
  }
}

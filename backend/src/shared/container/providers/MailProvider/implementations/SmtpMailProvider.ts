import * as nodemailer from 'nodemailer';

import { env } from '@config/env';

import { IMailProvider, MailMessage } from '../IMailProvider';

/**
 * Implementação SMTP via Nodemailer. Configurada por `MAIL_HOST` no .env.
 * Quando `MAIL_HOST` está vazio, o caller deve registrar `LoggerMailProvider` em vez
 * deste — o container faz a seleção no registro.
 */
export class SmtpMailProvider implements IMailProvider {
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: env.MAIL_SECURE,
      auth: env.MAIL_USER
        ? { user: env.MAIL_USER, pass: env.MAIL_PASS }
        : undefined,
    });
    return this.transporter;
  }

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const info = await this.getTransporter().sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_ADDRESS}>`,
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { messageId: info.messageId };
  }
}

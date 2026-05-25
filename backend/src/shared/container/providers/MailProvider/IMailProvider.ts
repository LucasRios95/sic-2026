/**
 * Provedor de envio de e-mail. Abstrai SMTP/SES/SendGrid — o domínio nunca importa
 * nodemailer diretamente.
 *
 * Anexos: passados como Buffer com nome de arquivo. Em vez de inline base64 (que
 * inflar 33% o payload), o provedor aceita binário direto e codifica conforme RFC 2045
 * apenas no momento do SMTP.
 */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailAttachment[];
}

export interface IMailProvider {
  send(message: MailMessage): Promise<{ messageId: string }>;
}

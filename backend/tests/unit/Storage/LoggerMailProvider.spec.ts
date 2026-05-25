import { describe, expect, it } from 'vitest';

import { LoggerMailProvider } from '@shared/container/providers/MailProvider/implementations/LoggerMailProvider';

describe('LoggerMailProvider', () => {
  it('retorna messageId opaco e não lança', async () => {
    const mailer = new LoggerMailProvider();
    const result = await mailer.send({
      to: 'cliente@example.com',
      subject: 'Test',
      text: 'Conteúdo',
      attachments: [
        {
          filename: 'doc.pdf',
          content: Buffer.from('pdf-bytes'),
          contentType: 'application/pdf',
        },
      ],
    });
    expect(result.messageId).toMatch(/^log-/);
  });

  it('aceita lista de destinatários', async () => {
    const mailer = new LoggerMailProvider();
    const result = await mailer.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Multi',
      text: 't',
    });
    expect(result.messageId).toMatch(/^log-/);
  });
});

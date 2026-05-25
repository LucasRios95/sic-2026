import { Request, Response, Router } from 'express';
import { container } from 'tsyringe';

import { FileSystemDocumentStorage } from '@shared/container/providers/DocumentStorage/implementations/FileSystemDocumentStorage';
import { IDocumentStorage } from '@shared/container/providers/DocumentStorage/IDocumentStorage';
import { NotFoundError } from '@shared/errors';

export const storageRoutes = Router();

/**
 * Rota pública (sem JWT) que serve conteúdo do storage filesystem via URL assinada.
 * O token carrega `key` + `exp` + HMAC — sem o segredo da app, ninguém forja URL.
 *
 * Em produção com S3, esta rota fica inativa: URLs assinadas vêm direto do bucket.
 */
storageRoutes.get('/:token', async (request: Request, response: Response) => {
  const storage = container.resolve<IDocumentStorage>('DocumentStorage');
  if (!(storage instanceof FileSystemDocumentStorage)) {
    // Apenas FileSystemDocumentStorage usa esta rota — outros adapters geram URLs
    // diretas do serviço.
    throw new NotFoundError('Endpoint de storage só disponível com STORAGE_DRIVER=filesystem');
  }

  const meta = await storage.statSignedToken(request.params.token);
  if (!meta) throw new NotFoundError('Token inválido ou expirado');

  const content = await storage.openSignedToken(request.params.token);
  if (!content) throw new NotFoundError('Conteúdo não encontrado');

  response.setHeader('Content-Type', meta.contentType);
  response.setHeader('Content-Length', String(content.length));
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${meta.key.split('/').pop() ?? 'document'}"`,
  );
  response.send(content);
});

import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileSystemDocumentStorage } from '@shared/container/providers/DocumentStorage/implementations/FileSystemDocumentStorage';

describe('FileSystemDocumentStorage', () => {
  let dir: string;
  let hmacKey: Buffer;
  let storage: FileSystemDocumentStorage;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'storage-'));
    hmacKey = crypto.randomBytes(32);
    storage = new FileSystemDocumentStorage({ basePath: dir, hmacKey });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('put / get / exists / remove formam um ciclo idempotente', async () => {
    const key = 'nfe/c/2026/06/abc.pdf';
    const content = Buffer.from('conteúdo do PDF teste');

    expect(await storage.exists(key)).toBe(false);
    const stored = await storage.put(key, content, 'application/pdf');
    expect(stored.size).toBe(content.length);
    expect(await storage.exists(key)).toBe(true);
    expect((await storage.get(key))?.equals(content)).toBe(true);

    await storage.remove(key);
    expect(await storage.exists(key)).toBe(false);
    // Remover algo inexistente é OK.
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('getSignedUrl emite token verificável e válido por TTL', async () => {
    const key = 'nfe/sample.pdf';
    const content = Buffer.from('hello');
    await storage.put(key, content, 'application/pdf');

    const url = await storage.getSignedUrl(key, 60);
    expect(url).toMatch(/^\/storage\//);
    const token = url.replace(/^\/storage\//, '');

    const opened = await storage.openSignedToken(token);
    expect(opened?.equals(content)).toBe(true);

    const meta = await storage.statSignedToken(token);
    expect(meta?.key).toBe(key);
    expect(meta?.contentType).toBe('application/pdf');
  });

  it('rejeita token expirado', async () => {
    const key = 'nfe/expired.pdf';
    await storage.put(key, Buffer.from('x'), 'application/pdf');

    const url = await storage.getSignedUrl(key, -1); // exp no passado
    const token = url.replace(/^\/storage\//, '');

    expect(await storage.openSignedToken(token)).toBeNull();
  });

  it('rejeita token assinado com outra chave', async () => {
    const key = 'nfe/tamper.pdf';
    await storage.put(key, Buffer.from('x'), 'application/pdf');

    const otherStorage = new FileSystemDocumentStorage({
      basePath: dir,
      hmacKey: crypto.randomBytes(32),
    });
    const url = await otherStorage.getSignedUrl(key, 60);
    const token = url.replace(/^\/storage\//, '');

    expect(await storage.openSignedToken(token)).toBeNull();
  });

  it('bloqueia path traversal na key', async () => {
    await expect(
      storage.put('../escape.pdf', Buffer.from('x'), 'application/pdf'),
    ).rejects.toThrow(/Key inválida/);
  });

  it('get retorna null quando o arquivo não existe', async () => {
    expect(await storage.get('nfe/ghost.pdf')).toBeNull();
  });
});

import crypto from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '@config/env';

import {
  IDocumentStorage,
  StorageObject,
} from '../IDocumentStorage';

/**
 * Adapter de storage em filesystem local — dev / homologação.
 *
 * Layout em disco:
 *   ${STORAGE_PATH}/<key sanitizada>
 *   ${STORAGE_PATH}/<key sanitizada>.meta.json   ← metadata (contentType, size)
 *
 * URLs assinadas:
 *   `/storage/{token}` onde token = base64url(payload).base64url(hmacSha256(payload))
 *   payload = JSON({ key, exp })
 *
 * A rota correspondente valida o HMAC e serve o conteúdo. Em produção S3, isto é
 * substituído por `getSignedUrl` nativo do bucket (URL pré-assinada).
 */
export class FileSystemDocumentStorage implements IDocumentStorage {
  private readonly basePath: string;
  private readonly hmacKey: Buffer;

  constructor(options: { basePath?: string; hmacKey?: Buffer } = {}) {
    this.basePath = path.resolve(options.basePath ?? env.STORAGE_PATH);
    // HMAC key derivada do JWT_SECRET (já obrigatório no env). Em produção S3 isto não é
    // necessário — usa-se o sigv4 do próprio bucket.
    this.hmacKey =
      options.hmacKey ??
      crypto.createHash('sha256').update(env.JWT_SECRET).digest();
  }

  async put(key: string, content: Buffer, contentType: string): Promise<StorageObject> {
    const filePath = this.resolveKey(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, { mode: 0o600 });
    await writeFile(
      `${filePath}.meta.json`,
      JSON.stringify({ contentType, size: content.length }),
      { mode: 0o600 },
    );
    return { key, contentType, size: content.length };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolveKey(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await unlink(filePath).catch((err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    });
    await unlink(`${filePath}.meta.json`).catch(() => undefined);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = Buffer.from(JSON.stringify({ key, exp }));
    const payloadB64 = payload.toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.hmacKey)
      .update(payloadB64)
      .digest('base64url');
    return `/storage/${payloadB64}.${signature}`;
  }

  /**
   * Valida e abre um token assinado. Usado pela rota `/storage/:token` para servir
   * o conteúdo sem expor a key real no path.
   */
  async openSignedToken(token: string): Promise<Buffer | null> {
    const parsed = this.verifyToken(token);
    if (!parsed) return null;
    return this.get(parsed.key);
  }

  async statSignedToken(token: string): Promise<{ key: string; contentType: string } | null> {
    const parsed = this.verifyToken(token);
    if (!parsed) return null;
    try {
      const metaRaw = await readFile(`${this.resolveKey(parsed.key)}.meta.json`, 'utf8');
      const meta = JSON.parse(metaRaw) as { contentType: string };
      return { key: parsed.key, contentType: meta.contentType };
    } catch {
      return null;
    }
  }

  private verifyToken(token: string): { key: string; exp: number } | null {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    const expected = crypto
      .createHmac('sha256', this.hmacKey)
      .update(payloadB64)
      .digest('base64url');
    // timingSafeEqual exige buffers do mesmo tamanho.
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
        key: string;
        exp: number;
      };
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private resolveKey(key: string): string {
    // Bloqueia path traversal — qualquer `..` ou caractere fora da whitelist é recusado.
    if (!/^[\w./-]+$/.test(key) || key.includes('..')) {
      throw new Error(`Key inválida: ${key}`);
    }
    return path.join(this.basePath, key);
  }
}

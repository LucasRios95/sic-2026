import crypto from 'node:crypto';

import { env } from '@config/env';

/**
 * Criptografia compartilhada do cofre de certificados (AES-256-GCM). Extraída para um módulo
 * próprio para que os adapters de filesystem e de banco usem exatamente o mesmo esquema —
 * um certificado cifrado por qualquer driver é legível por qualquer outro com a mesma
 * VAULT_MASTER_KEY (essencial ao migrar de filesystem → banco).
 *
 * IV de 12 bytes gerado por chamada (nunca reusado); tag de autenticação garante integridade.
 */
export interface EncryptedPayload {
  iv: string;
  tag: string;
  ct: string;
}

/** Carrega a chave-mestra (32 bytes). `explicit` permite testar sem mexer em process.env. */
export function loadVaultMasterKey(explicit?: Buffer): Buffer {
  const key = explicit ?? (env.VAULT_MASTER_KEY ? Buffer.from(env.VAULT_MASTER_KEY, 'base64') : Buffer.alloc(0));
  if (key.length !== 32) {
    throw new Error(
      'VAULT_MASTER_KEY deve ter 32 bytes (base64 de 44 caracteres). ' +
        'Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return key;
}

export function encryptSecret(masterKey: Buffer, plaintext: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

export function decryptSecret(masterKey: Buffer, payload: EncryptedPayload): Buffer {
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ct = Buffer.from(payload.ct, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

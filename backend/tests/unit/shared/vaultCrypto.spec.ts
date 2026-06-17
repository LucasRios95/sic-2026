import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  decryptSecret,
  encryptSecret,
  loadVaultMasterKey,
} from '@shared/container/providers/CertificateVault/implementations/vaultCrypto';

const KEY = crypto.randomBytes(32);

describe('vaultCrypto', () => {
  it('round-trip: decrypt(encrypt(x)) === x (binário)', () => {
    const plaintext = crypto.randomBytes(2048); // simula um PFX
    const enc = encryptSecret(KEY, plaintext);
    expect(decryptSecret(KEY, enc).equals(plaintext)).toBe(true);
  });

  it('round-trip de texto (senha) preserva o valor', () => {
    const senha = 'S3nh@-do-PFX-çãé';
    const enc = encryptSecret(KEY, Buffer.from(senha, 'utf8'));
    expect(decryptSecret(KEY, enc).toString('utf8')).toBe(senha);
  });

  it('cada cifragem usa IV novo (mesmo input → ciphertext diferente)', () => {
    const buf = Buffer.from('mesmo conteudo');
    const a = encryptSecret(KEY, buf);
    const b = encryptSecret(KEY, buf);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('chave errada falha na verificação da tag (GCM)', () => {
    const enc = encryptSecret(KEY, Buffer.from('segredo'));
    expect(() => decryptSecret(crypto.randomBytes(32), enc)).toThrow();
  });

  it('payload adulterado falha na verificação de integridade', () => {
    const enc = encryptSecret(KEY, Buffer.from('segredo'));
    const adulterado = { ...enc, ct: Buffer.from('outra coisa').toString('base64') };
    expect(() => decryptSecret(KEY, adulterado)).toThrow();
  });

  it('loadVaultMasterKey rejeita chave com tamanho != 32 bytes', () => {
    expect(() => loadVaultMasterKey(Buffer.alloc(16))).toThrow(/32 bytes/);
    expect(loadVaultMasterKey(KEY).equals(KEY)).toBe(true);
  });
});

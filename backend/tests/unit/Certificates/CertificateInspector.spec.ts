import { describe, expect, it } from 'vitest';
import * as forge from 'node-forge';

import { CertificateInspector } from '@modules/Certificates/domain/CertificateInspector';
import { CertificateType } from '@modules/Certificates/infra/typeorm/entities/Certificate';

function generatePkcs12(commonName: string, password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '0123456789ABCDEF';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'countryName', value: 'BR' },
    { name: 'organizationName', value: 'TESTE' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

describe('CertificateInspector', () => {
  const inspector = new CertificateInspector();

  it('extrai CN, CNPJ titular, validade e thumbprint do PFX', () => {
    const pfx = generatePkcs12('EMPRESA TESTE LTDA:11222333000181', 'senha');
    const md = inspector.inspect(pfx, 'senha');

    expect(md.commonName).toBe('EMPRESA TESTE LTDA:11222333000181');
    expect(md.cnpjTitular).toBe('11222333000181');
    expect(md.tipo).toBe(CertificateType.A1);
    expect(md.alias).toBe('EMPRESA TESTE LTDA');
    expect(md.serialNumber).toBe('0123456789ABCDEF');
    expect(md.thumbprint).toMatch(/^[0-9a-f]{40}$/);
    expect(md.validFrom.getUTCFullYear()).toBe(2026);
    expect(md.validTo.getUTCFullYear()).toBe(2027);
    expect(md.subject).toContain('CN=EMPRESA TESTE LTDA:11222333000181');
  });

  it('retorna cnpjTitular nulo quando CN não tem padrão Receita Federal', () => {
    const pfx = generatePkcs12('Sem CNPJ no fim', 'p');
    const md = inspector.inspect(pfx, 'p');
    expect(md.cnpjTitular).toBeNull();
    expect(md.commonName).toBe('Sem CNPJ no fim');
  });

  it('thumbprint diferente para certificados diferentes', () => {
    const a = inspector.inspect(generatePkcs12('A:11111111111111', 'p'), 'p');
    const b = inspector.inspect(generatePkcs12('B:22222222222222', 'p'), 'p');
    expect(a.thumbprint).not.toBe(b.thumbprint);
  });

  it('senha errada lança erro', () => {
    const pfx = generatePkcs12('TESTE:11222333000181', 'correta');
    expect(() => inspector.inspect(pfx, 'errada')).toThrow();
  });

  it('alias usa o fallback quando informado', () => {
    const pfx = generatePkcs12('NOME:11222333000181', 'p');
    const md = inspector.inspect(pfx, 'p', 'Apelido manual');
    expect(md.alias).toBe('Apelido manual');
  });
});

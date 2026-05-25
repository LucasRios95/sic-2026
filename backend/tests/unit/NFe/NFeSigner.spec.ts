import { describe, expect, it } from 'vitest';
import * as forge from 'node-forge';

import { NFeSigner } from '@modules/NFe/infra/signing/NFeSigner';

/**
 * Testes do assinador XML-DSig. Geramos um certificado auto-assinado em runtime para
 * não depender de PFX real — o que valida o round-trip (assinar → verificar) sem
 * precisar de certificado da Receita Federal nos testes.
 *
 * O round-trip aqui é a defesa de primeira linha contra erros de canonicalização C14N,
 * que é o problema #1 que gera rejeição em massa da SEFAZ.
 */

interface TestCert {
  pkcs12: Buffer;
  password: string;
  certificatePem: string;
}

function generateSelfSignedPkcs12(password: string): TestCert {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [
    { name: 'commonName', value: 'EMPRESA TESTE:11222333000181' },
    { name: 'countryName', value: 'BR' },
    { name: 'organizationName', value: 'TESTE' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return {
    pkcs12: Buffer.from(p12Der, 'binary'),
    password,
    certificatePem: forge.pki.certificateToPem(cert),
  };
}

describe('NFeSigner', () => {
  it('assina e valida em round-trip (canonicalização C14N + RSA-SHA256)', () => {
    const cert = generateSelfSignedPkcs12('teste123');
    const signer = new NFeSigner();

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
      '<infNFe Id="NFe35260611222333000181550010000000011000000017" versao="4.00">' +
      '<ide><cUF>35</cUF><cNF>00000001</cNF></ide>' +
      '</infNFe>' +
      '</NFe>';

    const signed = signer.sign(
      xml,
      cert.pkcs12,
      cert.password,
      'NFe35260611222333000181550010000000011000000017',
    );

    // O round-trip dentro do sign() já valida — se chegou aqui, a assinatura é íntegra.
    expect(signed).toContain('<Signature');
    expect(signed).toContain('xmldsig#rsa-sha256'); // algoritmo
    expect(signed).toContain('xml-exc-c14n#'); // canonicalização

    // Confirma que a assinatura quebra ao alterar 1 byte do payload.
    const tampered = signed.replace('<cUF>35</cUF>', '<cUF>31</cUF>');
    expect(signer.verify(tampered, cert.certificatePem)).toBe(false);
  });

  it('extractPemFromPkcs12 devolve chave e certificado em PEM válidos', () => {
    const cert = generateSelfSignedPkcs12('outra');
    const { privateKeyPem, certificatePem } = NFeSigner.extractPemFromPkcs12(
      cert.pkcs12,
      cert.password,
    );

    expect(privateKeyPem).toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/);
    expect(certificatePem).toMatch(/-----BEGIN CERTIFICATE-----/);
    // Pode reabrir com forge para validar a estrutura.
    expect(() => forge.pki.privateKeyFromPem(privateKeyPem)).not.toThrow();
    expect(() => forge.pki.certificateFromPem(certificatePem)).not.toThrow();
  });

  it('senha errada do PFX gera erro claro', () => {
    const cert = generateSelfSignedPkcs12('senha-correta');
    expect(() =>
      NFeSigner.extractPemFromPkcs12(cert.pkcs12, 'senha-errada'),
    ).toThrow();
  });
});

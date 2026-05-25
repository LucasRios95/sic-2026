import { SignedXml } from 'xml-crypto';
import * as forge from 'node-forge';

/**
 * Assinatura XML-DSig da NF-e — ponto mais sensível tecnicamente da integração SEFAZ.
 * Uma falha na canonicalização produz rejeição em massa (cStat 215 / 280).
 *
 * Padrão da NF-e (MOC item 9):
 *  - Canonicalização: Exclusive XML Canonicalization (C14N) — http://www.w3.org/2001/10/xml-exc-c14n#
 *  - Algoritmo de assinatura: RSA-SHA256 — http://www.w3.org/2001/04/xmldsig-more#rsa-sha256
 *  - Algoritmo de digest: SHA-256 — http://www.w3.org/2001/04/xmlenc#sha256
 *  - Reference XPath: o elemento `infNFe` (ou `infEvento` em eventos), referenciado por Id
 *  - Transforms: enveloped-signature + C14N exclusiva
 *
 * Entrada do certificado:
 *  - PFX (PKCS#12) + senha. O cofre (ICertificateVault) devolve esses dois — esta classe
 *    extrai a chave privada PEM e o certificado X.509 PEM para passar ao xml-crypto.
 *  - A3 (token físico/HSM) NÃO é suportado nesta fase — registrado como pendência no README.
 *    A diferença é que A3 não dá acesso direto à chave privada; o motor precisaria delegar
 *    a operação de assinatura para o token via PKCS#11 (lib externa).
 *
 * IMPORTANTE: este módulo NÃO loga o conteúdo do PFX, da senha, nem da chave privada.
 * O cofre é o único ponto que toca esses dados crus.
 */
export class NFeSigner {
  /**
   * Assina o XML da NF-e. Espera que o XML tenha um elemento `infNFe` com atributo `Id`
   * preenchido (o `NFeXmlBuilder` já faz isso).
   *
   * @param xml       XML cru (UTF-8 string)
   * @param pkcs12    Conteúdo binário do certificado A1 (PFX)
   * @param password  Senha do certificado
   * @param referenceId  Valor do atributo `Id` (ex.: "NFe35260612345678000181550010000000011000000017").
   *                     Sem o prefixo "#" — adicionamos internamente.
   */
  sign(xml: string, pkcs12: Buffer, password: string, referenceId: string): string {
    const { privateKeyPem, certificatePem } = NFeSigner.extractPemFromPkcs12(pkcs12, password);

    const sig = new SignedXml({
      privateKey: privateKeyPem,
      publicCert: certificatePem,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    });

    sig.addReference({
      xpath: `//*[@Id='${referenceId}']`,
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/2001/10/xml-exc-c14n#',
      ],
    });

    // O xml-crypto insere a tag <Signature> imediatamente após o elemento referenciado.
    // Para a NF-e isso é o comportamento correto: <Signature> é IRMÃ de <infNFe>, dentro
    // de <NFe>.
    sig.computeSignature(xml, {
      location: { reference: `//*[@Id='${referenceId}']`, action: 'after' },
    });

    const signed = sig.getSignedXml();

    // Round-trip: imediatamente verifica a assinatura que acabamos de gerar.
    // Falha aqui é bug local (canonicalização errada, certificado corrompido) — antes de
    // transmitir à SEFAZ, melhor descobrir.
    if (!this.verify(signed, certificatePem)) {
      throw new Error('Round-trip de assinatura falhou — verifique canonicalização C14N');
    }

    return signed;
  }

  /**
   * Valida a assinatura de um XML. Útil tanto no round-trip pós-assinatura quanto na
   * verificação de XMLs de NF-e RECEBIDOS (Distribuição DF-e — Fase 1b).
   */
  verify(signedXml: string, publicCert: string): boolean {
    const match = signedXml.match(/<Signature[\s\S]*?<\/Signature>/);
    if (!match) return false;
    const verifier = new SignedXml({ publicCert });
    verifier.loadSignature(match[0]);
    return verifier.checkSignature(signedXml);
  }

  /**
   * Extrai chave privada e certificado X.509 do PFX (PKCS#12) em formato PEM.
   * Centralizado aqui para que outras operações fiscais (assinatura de evento de
   * cancelamento, CC-e) possam reusar.
   */
  static extractPemFromPkcs12(
    pkcs12: Buffer,
    password: string,
  ): { privateKeyPem: string; certificatePem: string } {
    const p12Der = forge.util.createBuffer(pkcs12.toString('binary'), 'binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    // Procura o saco de chaves privadas e o saco de certificados.
    const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ]?.[0]
      ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ]?.[0];

    if (!keyBag?.key) throw new Error('Chave privada não encontrada no PFX');
    if (!certBag?.cert) throw new Error('Certificado X.509 não encontrado no PFX');

    return {
      privateKeyPem: forge.pki.privateKeyToPem(keyBag.key as forge.pki.PrivateKey),
      certificatePem: forge.pki.certificateToPem(certBag.cert),
    };
  }
}

import * as crypto from 'node:crypto';

import * as forge from 'node-forge';

import { CertificateType } from '../infra/typeorm/entities/Certificate';

export interface InspectedCertificate {
  alias: string;
  tipo: CertificateType;
  subject: string;
  commonName: string;
  /** CNPJ extraído do CN (formato Receita Federal: `NOME:CNPJ`). */
  cnpjTitular: string | null;
  serialNumber: string;
  /** SHA-1 do DER do certificado — fingerprint padrão. */
  thumbprint: string;
  validFrom: Date;
  validTo: Date;
}

/**
 * Extrai metadados do PFX (PKCS#12) para guardar em banco. Não persiste o conteúdo —
 * só lê o que vai para colunas de auditoria.
 *
 * O CN das ACs ICP-Brasil segue o padrão `NOMEEMPRESA:CNPJ` (14 dígitos no final).
 * Esta classe extrai o CNPJ para que o UploadCertificateUseCase possa confrontar com
 * `Company.cnpj` — se forem diferentes, recusa o upload (proteção contra subir cert
 * de uma empresa em conta de outra).
 */
export class CertificateInspector {
  inspect(pkcs12: Buffer, password: string, fallbackAlias?: string): InspectedCertificate {
    const p12Der = forge.util.createBuffer(pkcs12.toString('binary'), 'binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ]?.[0];
    if (!certBag?.cert) {
      throw new Error('Certificado X.509 não encontrado no PFX');
    }
    const cert = certBag.cert;

    const subjectAttrs = cert.subject.attributes;
    const cnAttr = subjectAttrs.find((a) => a.shortName === 'CN' || a.name === 'commonName');
    const commonName = (cnAttr?.value as string | undefined) ?? '';

    const subject = subjectAttrs
      .map((a) => `${a.shortName ?? a.name ?? ''}=${String(a.value)}`)
      .filter((s) => s.length > 0)
      .join(', ');

    // CNPJ extraído via regex — o CN padrão ICP-Brasil tem `:CNPJ` no fim.
    const cnpjMatch = commonName.match(/:(\d{14})\s*$/);
    const cnpjTitular = cnpjMatch ? cnpjMatch[1] : null;

    // Thumbprint SHA-1 do DER (padrão Windows/SEFAZ).
    const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const thumbprint = crypto
      .createHash('sha1')
      .update(Buffer.from(derBytes, 'binary'))
      .digest('hex');

    return {
      alias: fallbackAlias ?? commonName.split(':')[0] ?? 'Certificado',
      tipo: CertificateType.A1, // A3 exigiria PKCS#11 — fora do escopo desta entrega.
      subject,
      commonName,
      cnpjTitular,
      serialNumber: cert.serialNumber,
      thumbprint,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
    };
  }
}

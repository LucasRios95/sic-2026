const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';

/**
 * Monta o XML autorizado padrao de mercado (`nfeProc`) a partir da NF-e assinada
 * e do protocolo retornado pela SEFAZ. O retorno SOAP bruto nao deve ser entregue
 * como XML fiscal ao usuario.
 */
export function buildNfeProcXml(signedNfeXml: string, sefazResponseXml: string): string | null {
  const nfe = extractElementXml(signedNfeXml, 'NFe');
  const protNFe = extractElementXml(sefazResponseXml, 'protNFe');
  if (!nfe || !protNFe) return null;

  return `<nfeProc versao="4.00" xmlns="${NFE_NS}">${stripXmlDeclaration(nfe)}${stripXmlDeclaration(protNFe)}</nfeProc>`;
}

export function normalizeAuthorizedXml(
  xmlAutorizado: string | null | undefined,
  signedNfeXml: string | null | undefined,
): string | null {
  if (xmlAutorizado && isNfeProcXml(xmlAutorizado)) return xmlAutorizado;
  if (xmlAutorizado && signedNfeXml) {
    const nfeProc = buildNfeProcXml(signedNfeXml, xmlAutorizado);
    if (nfeProc) return nfeProc;
  }
  return xmlAutorizado ?? signedNfeXml ?? null;
}

function isNfeProcXml(xml: string): boolean {
  return /^<\?xml\b[^>]*>\s*<nfeProc\b|^\s*<nfeProc\b/.test(xml);
}

function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\s*<\?xml\b[^>]*>\s*/i, '');
}

function extractElementXml(xml: string, localName: string): string | null {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w.-]+:)?${localName}>`,
    'i',
  );
  const match = xml.match(pattern);
  return match ? match[0] : null;
}

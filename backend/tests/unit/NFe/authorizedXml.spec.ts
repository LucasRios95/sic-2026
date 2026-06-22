import { describe, expect, it } from 'vitest';

import { buildNfeProcXml, normalizeAuthorizedXml } from '@modules/NFe/domain/authorized-xml';

describe('authorized-xml', () => {
  const signedXml =
    '<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe123" versao="4.00" /></NFe>';
  const soapResponse =
    '<soap:Envelope><soap:Body><nfeResultMsg><retEnviNFe><cStat>104</cStat><protNFe versao="4.00"><infProt><chNFe>123</chNFe><nProt>999</nProt><cStat>100</cStat></infProt></protNFe></retEnviNFe></nfeResultMsg></soap:Body></soap:Envelope>';

  it('monta nfeProc com NFe assinada e protocolo extraido do retorno SEFAZ', () => {
    const xml = buildNfeProcXml(signedXml, soapResponse);

    expect(xml).toContain('<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">');
    expect(xml).toContain('<NFe xmlns="http://www.portalfiscal.inf.br/nfe">');
    expect(xml).toContain('<protNFe versao="4.00">');
    expect(xml).toContain('<nProt>999</nProt>');
    expect(xml).toContain('</nfeProc>');
  });

  it('mantem nfeProc ja normalizado', () => {
    const nfeProc = '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"></nfeProc>';

    expect(normalizeAuthorizedXml(nfeProc, signedXml)).toBe(nfeProc);
  });
});

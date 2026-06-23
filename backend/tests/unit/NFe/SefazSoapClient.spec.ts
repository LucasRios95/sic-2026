import { describe, expect, it } from 'vitest';

import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';

describe('SefazSoapClient', () => {
  it('usa wrapper SOAP específico para NFeDistribuicaoDFe', () => {
    const client = Object.create(SefazSoapClient.prototype) as SefazSoapClient;
    const envelope = (
      client as unknown as {
        wrapInSoapEnvelope: (body: string, service: 'NFeDistribuicaoDFe') => string;
      }
    ).wrapInSoapEnvelope('<distDFeInt />', 'NFeDistribuicaoDFe');

    expect(envelope).toContain('<nfeDistDFeInteresse');
    expect(envelope).toContain(
      'xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"',
    );
    expect(envelope).toContain('<nfeDadosMsg><distDFeInt /></nfeDadosMsg>');
  });
});

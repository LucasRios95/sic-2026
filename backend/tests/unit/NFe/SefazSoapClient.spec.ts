import { describe, expect, it } from 'vitest';

import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';
import { SefazService } from '@modules/NFe/infra/sefaz/SefazEndpoints';

/** extractStatus é privado — instanciamos com deps vazias porque ele só usa o parser. */
function extractStatus(xml: string, service: SefazService) {
  const client = new SefazSoapClient(
    undefined as never,
    undefined as never,
  ) as unknown as {
    extractStatus: (xml: string, service: SefazService) => { cStat?: string; xMotivo?: string };
  };
  return client.extractStatus(xml, service);
}

const soapWrap = (body: string) =>
  `<soap:Envelope><soap:Body><nfeResultMsg>${body}</nfeResultMsg></soap:Body></soap:Envelope>`;

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

  describe('extractStatus', () => {
    it('lê o cStat do evento (infEvento) e não o do lote 128', () => {
      const xml = soapWrap(
        '<retEnvEvento versao="1.00"><idLote>1</idLote>' +
          '<cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo>' +
          '<retEvento versao="1.00"><infEvento>' +
          '<cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo>' +
          '<nProt>135260000123456</nProt>' +
          '</infEvento></retEvento></retEnvEvento>',
      );

      expect(extractStatus(xml, 'NFeRecepcaoEvento4')).toEqual({
        cStat: '135',
        xMotivo: 'Evento registrado e vinculado a NF-e',
      });
    });

    it('lê a rejeição do evento (ex.: 501 fora do prazo) em vez do lote', () => {
      const xml = soapWrap(
        '<retEnvEvento><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo>' +
          '<retEvento><infEvento><cStat>501</cStat>' +
          '<xMotivo>Rejeicao: Prazo de cancelamento superior ao previsto na legislacao</xMotivo>' +
          '</infEvento></retEvento></retEnvEvento>',
      );

      expect(extractStatus(xml, 'NFeRecepcaoEvento4').cStat).toBe('501');
    });

    it('cai no cStat do lote quando a SEFAZ rejeita o lote inteiro (sem retEvento)', () => {
      const xml = soapWrap(
        '<retEnvEvento><cStat>215</cStat><xMotivo>Falha no schema XML</xMotivo></retEnvEvento>',
      );

      expect(extractStatus(xml, 'NFeRecepcaoEvento4')).toEqual({
        cStat: '215',
        xMotivo: 'Falha no schema XML',
      });
    });

    it('na autorização continua lendo infProt, não o lote 104', () => {
      const xml = soapWrap(
        '<retEnviNFe><cStat>104</cStat><xMotivo>Lote processado</xMotivo>' +
          '<protNFe versao="4.00"><infProt><chNFe>123</chNFe><nProt>999</nProt>' +
          '<cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>' +
          '</infProt></protNFe></retEnviNFe>',
      );

      expect(extractStatus(xml, 'NFeAutorizacao4').cStat).toBe('100');
    });

    it('na consulta usa o cStat da raiz (situação atual: 101 cancelada)', () => {
      const xml = soapWrap(
        '<retConsSitNFe><cStat>101</cStat><xMotivo>Cancelamento de NF-e homologado</xMotivo>' +
          '<protNFe><infProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>' +
          '</infProt></protNFe></retConsSitNFe>',
      );

      expect(extractStatus(xml, 'NFeConsultaProtocolo4').cStat).toBe('101');
    });

    it('na inutilização lê infInut', () => {
      const xml = soapWrap(
        '<retInutNFe><infInut><cStat>102</cStat>' +
          '<xMotivo>Inutilizacao de numero homologado</xMotivo></infInut></retInutNFe>',
      );

      expect(extractStatus(xml, 'NFeInutilizacao4').cStat).toBe('102');
    });
  });
});

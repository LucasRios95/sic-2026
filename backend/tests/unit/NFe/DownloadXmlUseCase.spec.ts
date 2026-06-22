import { describe, expect, it, vi } from 'vitest';

import { DocumentStatus } from '@modules/NFe/domain/nfe-enums';
import { NFe } from '@modules/NFe/infra/typeorm/entities/NFe';
import { INFeRepository } from '@modules/NFe/repositories/INFeRepository';
import { DownloadXmlUseCase } from '@modules/NFe/useCases/DownloadXml/DownloadXmlUseCase';

function makeRepo(nfe: NFe | null): INFeRepository {
  return {
    findById: vi.fn(async () => nfe),
    findByIdAny: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    findByIdWithRelations: vi.fn(),
    listStaleProcessing: vi.fn(),
    createAggregate: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    findByScope: vi.fn(),
    hardDelete: vi.fn(),
  } as unknown as INFeRepository;
}

describe('DownloadXmlUseCase', () => {
  it('baixa NF-e autorizada como chave.xml e normaliza SOAP bruto para nfeProc', async () => {
    const signedXml = '<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe35260616806604000160550010000092431973531303" versao="4.00" /></NFe>';
    const soapResponse =
      '<soap:Envelope><soap:Body><retEnviNFe><protNFe versao="4.00"><infProt><nProt>135</nProt><cStat>100</cStat></infProt></protNFe></retEnviNFe></soap:Body></soap:Envelope>';
    const nfe = {
      id: 'nfe-1',
      companyId: 'company-1',
      status: DocumentStatus.AUTHORIZED,
      chaveAcesso: '35260616806604000160550010000092431973531303',
      xmlAssinado: signedXml,
      xmlAutorizado: soapResponse,
    } as NFe;

    const result = await new DownloadXmlUseCase(makeRepo(nfe)).execute({
      companyId: 'company-1',
      nfeId: 'nfe-1',
    });

    expect(result.filename).toBe('35260616806604000160550010000092431973531303.xml');
    expect(result.tipo).toBe('NFeAutorizada');
    expect(result.xml).toContain('<nfeProc versao="4.00"');
    expect(result.xml).toContain('<protNFe versao="4.00">');
  });
});

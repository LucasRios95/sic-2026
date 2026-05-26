import { XMLParser } from 'fast-xml-parser';
import { inject, injectable } from 'tsyringe';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';

import { decodeDocZip, DocZipRaw } from './sefazPayload';

export interface DistribuicaoResult {
  cStat: string | null;
  xMotivo: string | null;
  /** NSU mais recente do ambiente (`ultNSU` retornado pelo SEFAZ) — usado para detectar lacunas. */
  ultNSU: string | null;
  /** NSU mais alto contido no lote desta resposta — usado para avançar o cursor. */
  maxNSU: string | null;
  documentos: DocZipRaw[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
});

/**
 * Service que orquestra a chamada ao `nfeDistribuicaoDFe` (ambiente nacional da SEFAZ).
 * Composição do body, transmissão via `SefazSoapClient` (com mTLS), parsing do retorno
 * e descompactação dos `docZip` ficam tudo aqui.
 *
 * Limitações por chamada (impostas pela SEFAZ):
 *  - Máximo 50 docZip por resposta.
 *  - Quando o `maxNSU` retornado for menor que o `ultNSU`, ainda há mais documentos —
 *    o caller faz nova chamada com cursor avançado.
 */
@injectable()
export class NFeDistribuicaoDFeService {
  constructor(
    @inject(SefazSoapClient)
    private readonly soap: SefazSoapClient,
  ) {}

  /**
   * Consulta lote por NSU. Quando `ultNSU` é informado, pede a partir desse NSU + 1;
   * sem ele, faz consulta inicial pegando os primeiros 50 documentos.
   */
  async consultarPorNSU(input: {
    companyId: string;
    ambiente: AmbienteSefaz;
    ufEmitente: string;
    cnpjEmpresa: string;
    ultNSU: string;
    certificateVaultRef: string;
  }): Promise<DistribuicaoResult> {
    const body = this.buildBody({
      ambiente: input.ambiente,
      cnpjEmpresa: input.cnpjEmpresa,
      ultNSU: input.ultNSU,
    });

    const result = await this.soap.call({
      companyId: input.companyId,
      uf: input.ufEmitente, // Distribuição vai pelo ambiente nacional; UF aqui é só para tabela
      ambiente: input.ambiente,
      service: 'NFeDistribuicaoDFe',
      bodyXml: body,
      certificateVaultRef: input.certificateVaultRef,
    });

    return this.parseRetorno(result.responseXml ?? '');
  }

  private buildBody(input: {
    ambiente: AmbienteSefaz;
    cnpjEmpresa: string;
    ultNSU: string;
  }): string {
    const tpAmb = input.ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2';
    // cUFAutor 91 = ambiente nacional (não tem UF específica para distribuição).
    return [
      '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">',
      `<tpAmb>${tpAmb}</tpAmb>`,
      '<cUFAutor>91</cUFAutor>',
      `<CNPJ>${input.cnpjEmpresa.replace(/\D/g, '')}</CNPJ>`,
      '<distNSU>',
      `<ultNSU>${input.ultNSU.padStart(15, '0')}</ultNSU>`,
      '</distNSU>',
      '</distDFeInt>',
    ].join('');
  }

  /**
   * Extrai do XML de retorno: cStat, ultNSU/maxNSU e a lista de docZip já descompactados.
   * Tolerante a ausências (SEFAZ devolve cStat 138 "sem novidades" sem `docZip`).
   */
  private parseRetorno(responseXml: string): DistribuicaoResult {
    if (!responseXml) {
      return { cStat: null, xMotivo: null, ultNSU: null, maxNSU: null, documentos: [] };
    }
    const parsed = xmlParser.parse(responseXml) as Record<string, unknown>;
    const ret = findRecursive(parsed, 'retDistDFeInt') as Record<string, unknown> | null;
    const root = ret ?? findRecursive(parsed, 'retDistribuicaoDFe') ?? parsed;

    const cStat = root && 'cStat' in root ? String(root.cStat) : null;
    const xMotivo = root && 'xMotivo' in root ? String(root.xMotivo) : null;
    const ultNSU = root && 'ultNSU' in root ? String(root.ultNSU) : null;
    const maxNSU = root && 'maxNSU' in root ? String(root.maxNSU) : null;

    const loteRaw = root ? findRecursive(root, 'loteDistDFeInt') : null;
    if (!loteRaw) {
      return { cStat, xMotivo, ultNSU, maxNSU, documentos: [] };
    }

    const docZipRaw = (loteRaw as Record<string, unknown>).docZip;
    const docZipArray = Array.isArray(docZipRaw) ? docZipRaw : docZipRaw ? [docZipRaw] : [];

    const documentos: DocZipRaw[] = [];
    for (const item of docZipArray) {
      const obj = item as Record<string, unknown>;
      const content = String(obj['#text'] ?? '');
      const nsu = String(obj['@NSU'] ?? '');
      const schema = String(obj['@schema'] ?? '').replace(/_v\d+\.\d+/, '').split('_')[0];
      if (!content || !nsu) continue;
      try {
        documentos.push(decodeDocZip({ nsu, schema, base64Content: content }));
      } catch (err) {
        // Documento corrompido: pula. O cursor não pode parar por causa disso.
        void err;
      }
    }

    return { cStat, xMotivo, ultNSU, maxNSU, documentos };
  }
}

function findRecursive(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (key in o) return o[key];
  for (const value of Object.values(o)) {
    const found = findRecursive(value, key);
    if (found !== null) return found;
  }
  return null;
}

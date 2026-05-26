import { gunzipSync } from 'node:zlib';

import { XMLParser } from 'fast-xml-parser';

/**
 * Utilidades para decodificar a resposta do `nfeDistribuicaoDFe` da SEFAZ.
 *
 * Cada `docZip` retornado vem em base64 + gzip — formato fechado da Receita Federal
 * para reduzir tráfego. O wrapper aqui faz a descompactação e expõe um shape semântico
 * para os caminhos comuns (resumo de NF-e/CT-e e XML completo após manifestação).
 *
 * Documentação: MOC NF-e item 5.5 (Web Service de Distribuição de DF-e).
 */

export interface DocZipRaw {
  /** NSU específico deste docZip dentro do lote. */
  nsu: string;
  /** Tipo do documento embrulhado: "resNFe", "procNFe", "resEvento", "procEventoNFe" etc. */
  schema: string;
  /** XML descompactado pronto para parsing. */
  xml: string;
}

export interface ResumoNFeData {
  chaveAcesso: string;
  emitenteCnpj: string;
  emitenteNome: string;
  dhEmissao: Date;
  valorTotal: string;
  ufEmitente?: string;
  numero?: string;
  serie?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
});

/**
 * Descompacta um docZip do `nfeDistribuicaoDFe`. SEFAZ embrulha cada documento em
 * base64 → gzip → XML; reproduzimos o processo na ordem inversa.
 */
export function decodeDocZip(input: {
  nsu: string;
  schema: string;
  base64Content: string;
}): DocZipRaw {
  const compressed = Buffer.from(input.base64Content, 'base64');
  const xml = gunzipSync(compressed).toString('utf8');
  return { nsu: input.nsu, schema: input.schema, xml };
}

/**
 * Extrai do XML do resumo (resNFe) os campos que persistimos para listagem rápida.
 * SEFAZ envia campos com namespace `http://www.portalfiscal.inf.br/nfe`; a opção
 * `removeNSPrefix: true` no parser limpa para acesso direto.
 */
export function parseResumoNFe(xml: string): ResumoNFeData {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const resNFe = (parsed.resNFe ?? parsed.resnfe ?? parsed) as Record<string, unknown>;

  const chaveAcesso = String(resNFe.chNFe ?? '');
  if (!/^\d{44}$/.test(chaveAcesso)) {
    throw new Error('Resumo NF-e sem chave de acesso válida');
  }

  const cnpjRaw = String(resNFe.CNPJ ?? resNFe.cnpj ?? '');
  return {
    chaveAcesso,
    emitenteCnpj: cnpjRaw.replace(/\D/g, ''),
    emitenteNome: String(resNFe.xNome ?? ''),
    dhEmissao: new Date(String(resNFe.dhEmi ?? new Date().toISOString())),
    valorTotal: String(resNFe.vNF ?? '0.00'),
    ufEmitente: ufFromChave(chaveAcesso),
    numero: String(chaveAcesso.slice(25, 34)).replace(/^0+/, ''),
    serie: String(chaveAcesso.slice(22, 25)).replace(/^0+/, '') || '0',
  };
}

/**
 * Resolve a UF do emitente pelo cUF embutido nos 2 primeiros dígitos da chave.
 * Tabela IBGE oficial — coincide com o módulo `nfe-enums` do NF-e, mas evita import
 * cruzado entre módulos para não criar acoplamento desnecessário.
 */
function ufFromChave(chave: string): string | undefined {
  const codigo = chave.slice(0, 2);
  const map: Record<string, string> = {
    '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
    '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
    '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
    '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
  };
  return map[codigo];
}

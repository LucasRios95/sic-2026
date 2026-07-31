/**
 * Consulta a situação real de uma NF-e na SEFAZ (NFeConsultaProtocolo4), direto do
 * terminal — sem passar pelo banco nem pelo app. Serve para responder "essa nota está
 * cancelada na SEFAZ ou não?" quando o status local está sob suspeita.
 *
 * Uso:
 *   npx tsx scripts/consultar-nfe.ts <chave44> <caminho.pfx> <senha> [producao|homologacao]
 *
 * Saída: cStat/xMotivo da SITUAÇÃO atual (100 autorizada, 101 cancelada, 217 não consta)
 * + a lista de eventos vinculados (cancelamento, CC-e...), com protocolo e data.
 */
import https from 'node:https';

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

import { AmbienteSefaz } from '../src/modules/Companies/infra/typeorm/entities/Company';
import { SefazEndpoints } from '../src/modules/NFe/infra/sefaz/SefazEndpoints';
import { NFeSigner } from '../src/modules/NFe/infra/signing/NFeSigner';

const [chave, pfxPath, senha, ambienteArg = 'producao'] = process.argv.slice(2);

if (!chave || !pfxPath || !senha) {
  console.error(
    'Uso: npx tsx scripts/consultar-nfe.ts <chave44> <caminho.pfx> <senha> [producao|homologacao]',
  );
  process.exit(1);
}
if (!/^\d{44}$/.test(chave)) {
  console.error(`Chave inválida: esperado 44 dígitos, recebido ${chave.length} caracteres`);
  process.exit(1);
}

const ambiente =
  ambienteArg === 'homologacao' ? AmbienteSefaz.HOMOLOGACAO : AmbienteSefaz.PRODUCAO;
// cUF (2 primeiros dígitos da chave) → UF, para achar a autorizadora certa.
const uf = ufFromChave(chave);

async function main() {
  const { readFileSync } = await import('node:fs');
  const pfx = readFileSync(pfxPath);
  const { privateKeyPem, certificatePem } = NFeSigner.extractPemFromPkcs12(pfx, senha);

  const { url, autorizadora } = SefazEndpoints.url(uf, ambiente, 'NFeConsultaProtocolo4');
  const bodyXml =
    '<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">' +
    `<tpAmb>${ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2'}</tpAmb>` +
    '<xServ>CONSULTAR</xServ>' +
    `<chNFe>${chave}</chNFe>` +
    '</consSitNFe>';

  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>' +
    '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">' +
    bodyXml +
    '</nfeDadosMsg></soap12:Body></soap12:Envelope>';

  console.log(`Consultando ${autorizadora} (${uf}, ${ambienteArg})\n  ${url}\n`);

  const response = await axios.post<string>(url, envelope, {
    timeout: 30_000,
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      SOAPAction: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4',
    },
    httpsAgent: new https.Agent({
      cert: certificatePem,
      key: privateKeyPem,
      minVersion: 'TLSv1.2',
      // Cadeia ICP-Brasil não está no trust store do Node; a consulta é read-only e
      // roda na mão do operador, então não exigimos o bundle aqui.
      rejectUnauthorized: false,
    }),
    validateStatus: () => true,
    transformResponse: [(d) => d],
  });

  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const parsed = parser.parse(response.data) as Record<string, unknown>;
  const ret = findByKey(parsed, 'retConsSitNFe') as Record<string, unknown> | undefined;

  if (!ret) {
    console.log(`HTTP ${response.status} — resposta sem retConsSitNFe:\n${response.data}`);
    return;
  }

  console.log(`SITUAÇÃO: cStat ${ret.cStat} — ${ret.xMotivo}`);
  console.log(interpretar(String(ret.cStat)));

  const infProt = findByKey(ret, 'infProt') as Record<string, unknown> | undefined;
  if (infProt) {
    console.log(
      `\nAutorização: cStat ${infProt.cStat} — ${infProt.xMotivo}` +
        `\n  protocolo ${infProt.nProt} em ${infProt.dhRecbto}`,
    );
  }

  const eventos = asArray(findByKey(ret, 'procEventoNFe'));
  if (eventos.length === 0) {
    console.log('\nEventos vinculados: NENHUM (não há cancelamento registrado na SEFAZ).');
  } else {
    console.log(`\nEventos vinculados: ${eventos.length}`);
    for (const evento of eventos) {
      const inf = findByKey(evento, 'infEvento') as Record<string, unknown> | undefined;
      if (!inf) continue;
      console.log(
        `  - tpEvento ${inf.tpEvento} (${inf.xEvento ?? '?'}) seq ${inf.nSeqEvento}` +
          ` → cStat ${inf.cStat} ${inf.xMotivo}` +
          `\n    protocolo ${inf.nProt ?? '-'} em ${inf.dhRegEvento ?? '-'}`,
      );
    }
  }
}

function interpretar(cStat: string): string {
  if (cStat === '100') return '  → NF-e AUTORIZADA e NÃO cancelada na SEFAZ.';
  if (cStat === '101' || cStat === '151' || cStat === '135') {
    return '  → NF-e CANCELADA na SEFAZ.';
  }
  if (cStat === '217') return '  → SEFAZ não tem essa chave na base.';
  if (['110', '205', '301', '302'].includes(cStat)) return '  → NF-e DENEGADA.';
  return '  → Ver tabela de cStat do MOC.';
}

function ufFromChave(ch: string): string {
  const cUF = ch.slice(0, 2);
  const mapa: Record<string, string> = {
    '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
    '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
    '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
    '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
  };
  const uf = mapa[cUF];
  if (!uf) throw new Error(`cUF ${cUF} desconhecido na chave`);
  return uf;
}

function findByKey(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  if (o[key] !== undefined) return o[key];
  for (const value of Object.values(o)) {
    const found = findByKey(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
}

main().catch((err) => {
  console.error('Falha na consulta:', err instanceof Error ? err.message : err);
  process.exit(1);
});

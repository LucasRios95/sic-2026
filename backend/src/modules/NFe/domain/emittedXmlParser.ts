import { XMLParser } from 'fast-xml-parser';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';

import { FinalidadeNFe, TipoOperacao } from './nfe-enums';

/**
 * Parser de XML de NF-e modelo 55 (autorizada) EMITIDA em outro sistema, para importar no
 * histórico de notas emitidas. Extrai cabeçalho, itens, totais e protocolo. Aceita tanto
 * `nfeProc` (NF-e + protocolo) quanto uma `NFe` isolada.
 *
 * Escopo: só NF-e 55. Campos ausentes recebem defaults seguros ('0.00'/null). A validação
 * de emitente (CNPJ) e de autorização (cStat) fica no use case, não aqui.
 */

export interface ParsedEmittedItem {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cest: string | null;
  cfop: string;
  unidadeComercial: string;
  quantidadeComercial: string;
  valorUnitario: string;
  valorTotal: string;
  valorDesconto: string;
  valorFrete: string;
  valorSeguro: string;
  valorOutros: string;
  origemMercadoria: number | null;
  cstIcms: string | null;
  csosnIcms: string | null;
  baseIcms: string | null;
  aliqIcms: string | null;
  valorIcms: string | null;
  cstIpi: string | null;
  baseIpi: string | null;
  aliqIpi: string | null;
  valorIpi: string | null;
  cstPis: string | null;
  basePis: string | null;
  aliqPis: string | null;
  valorPis: string | null;
  cstCofins: string | null;
  baseCofins: string | null;
  aliqCofins: string | null;
  valorCofins: string | null;
}

export interface ParsedEmittedNFe {
  chaveAcesso: string;
  modelo: string;
  serie: number;
  numero: string;
  naturezaOperacao: string;
  dhEmissao: Date;
  dhSaiEnt: Date | null;
  tipoOperacao: TipoOperacao;
  finalidade: FinalidadeNFe;
  ambiente: AmbienteSefaz;
  emitenteCnpj: string;
  emitenteNome: string;
  destinatarioCnpj: string | null;
  destinatarioNome: string | null;
  operacaoInterestadual: boolean;
  ufDestino: string | null;
  /** Protocolo de autorização (grupo protNFe/infProt), quando o arquivo é nfeProc. */
  cStat: string | null;
  xMotivo: string | null;
  protocolo: string | null;
  dhAutorizacao: Date | null;
  infCpl: string | null;
  infAdFisco: string | null;
  totais: {
    valorProdutos: string;
    valorFrete: string;
    valorSeguro: string;
    valorDesconto: string;
    valorOutros: string;
    valorTotal: string;
    baseIcms: string;
    valorIcms: string;
    valorIcmsDeson: string;
    baseIcmsST: string;
    valorIcmsST: string;
    valorFCP: string;
    valorICMSUFDest: string;
    valorICMSUFRemet: string;
    valorFCPUFDest: string;
    valorIpi: string;
    valorPis: string;
    valorCofins: string;
    valorII: string;
    valorTotTrib: string;
    baseIbsCbs: string;
    valorIbs: string;
    valorCbs: string;
    valorIs: string;
  };
  items: ParsedEmittedItem[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
});

export function parseEmittedNFeXml(xml: string): ParsedEmittedNFe {
  const root = xmlParser.parse(xml) as Record<string, unknown>;
  const nfeNode = asRecord(findRecursive(root, 'NFe'));
  if (!nfeNode) throw new Error('XML não reconhecido como NF-e (elemento <NFe> ausente)');

  const infNFe = asRecord(nfeNode.infNFe);
  if (!infNFe) throw new Error('NF-e sem <infNFe>');

  const chaveAcesso = chaveFromId(infNFe['@Id']);
  const modelo = chaveAcesso.slice(20, 22);
  if (modelo !== '55') {
    throw new Error(`Modelo ${modelo || 'desconhecido'} não suportado (só NF-e 55)`);
  }

  const ide = asRecord(infNFe.ide) ?? {};
  const emit = asRecord(infNFe.emit) ?? {};
  const dest = asRecord(infNFe.dest) ?? {};
  const enderDest = asRecord(dest.enderDest) ?? {};
  const total = asRecord(infNFe.total) ?? {};
  const icmsTot = asRecord(total.ICMSTot) ?? {};
  const ibsCbsTot = asRecord(total.IBSCBSTot) ?? {};
  const gIbs = asRecord(ibsCbsTot.gIBS) ?? {};
  const gCbs = asRecord(ibsCbsTot.gCBS) ?? {};
  const gIs = asRecord(ibsCbsTot.gIS) ?? {};
  const infAdic = asRecord(infNFe.infAdic) ?? {};

  // Protocolo (só existe quando é nfeProc). Aceita protNFe em qualquer nível.
  const protNFe = asRecord(findRecursive(root, 'protNFe'));
  const infProt = asRecord(protNFe?.infProt) ?? {};

  const idDest = str(ide.idDest);
  const operacaoInterestadual = idDest === '2';

  const detRaw = infNFe.det;
  const detArray = Array.isArray(detRaw) ? detRaw : detRaw ? [detRaw] : [];

  return {
    chaveAcesso,
    modelo,
    serie: Number(strOrDefault(ide.serie, '0')),
    numero: strOrDefault(ide.nNF, '0'),
    naturezaOperacao: strOrDefault(ide.natOp, 'Importada'),
    dhEmissao: dateOrNow(ide.dhEmi),
    dhSaiEnt: dateOrNull(ide.dhSaiEnt),
    tipoOperacao: str(ide.tpNF) === '0' ? TipoOperacao.ENTRADA : TipoOperacao.SAIDA,
    finalidade: FINALIDADE_POR_CODIGO[str(ide.finNFe)] ?? FinalidadeNFe.NORMAL,
    ambiente: str(ide.tpAmb) === '2' ? AmbienteSefaz.HOMOLOGACAO : AmbienteSefaz.PRODUCAO,
    emitenteCnpj: onlyDigits(emit.CNPJ ?? emit.CPF),
    emitenteNome: strOrDefault(emit.xNome, ''),
    destinatarioCnpj: onlyDigitsOrNull(dest.CNPJ ?? dest.CPF),
    destinatarioNome: strOrNull(dest.xNome),
    operacaoInterestadual,
    ufDestino: operacaoInterestadual ? strOrNull(enderDest.UF) : null,
    cStat: strOrNull(infProt.cStat),
    xMotivo: strOrNull(infProt.xMotivo),
    protocolo: strOrNull(infProt.nProt),
    dhAutorizacao: dateOrNull(infProt.dhRecbto),
    infCpl: strOrNull(infAdic.infCpl),
    infAdFisco: strOrNull(infAdic.infAdFisco),
    totais: {
      valorProdutos: strOrDefault(icmsTot.vProd, '0.00'),
      valorFrete: strOrDefault(icmsTot.vFrete, '0.00'),
      valorSeguro: strOrDefault(icmsTot.vSeg, '0.00'),
      valorDesconto: strOrDefault(icmsTot.vDesc, '0.00'),
      valorOutros: strOrDefault(icmsTot.vOutro, '0.00'),
      valorTotal: strOrDefault(icmsTot.vNF, '0.00'),
      baseIcms: strOrDefault(icmsTot.vBC, '0.00'),
      valorIcms: strOrDefault(icmsTot.vICMS, '0.00'),
      valorIcmsDeson: strOrDefault(icmsTot.vICMSDeson, '0.00'),
      baseIcmsST: strOrDefault(icmsTot.vBCST, '0.00'),
      valorIcmsST: strOrDefault(icmsTot.vST, '0.00'),
      valorFCP: strOrDefault(icmsTot.vFCP, '0.00'),
      valorICMSUFDest: strOrDefault(icmsTot.vICMSUFDest, '0.00'),
      valorICMSUFRemet: strOrDefault(icmsTot.vICMSUFRemet, '0.00'),
      valorFCPUFDest: strOrDefault(icmsTot.vFCPUFDest, '0.00'),
      valorIpi: strOrDefault(icmsTot.vIPI, '0.00'),
      valorPis: strOrDefault(icmsTot.vPIS, '0.00'),
      valorCofins: strOrDefault(icmsTot.vCOFINS, '0.00'),
      valorII: strOrDefault(icmsTot.vII, '0.00'),
      valorTotTrib: strOrDefault(icmsTot.vTotTrib, '0.00'),
      baseIbsCbs: strOrDefault(ibsCbsTot.vBCIBSCBS, '0.00'),
      valorIbs: strOrDefault(gIbs.vIBS, '0.00'),
      valorCbs: strOrDefault(gCbs.vCBS, '0.00'),
      valorIs: strOrDefault(gIs.vIS, '0.00'),
    },
    items: detArray.map((d, idx) => parseItem(asRecord(d) ?? {}, idx)),
  };
}

function parseItem(det: Record<string, unknown>, idx: number): ParsedEmittedItem {
  const prod = asRecord(det.prod) ?? {};
  const imposto = asRecord(det.imposto) ?? {};
  const icms = firstGroup(asRecord(imposto.ICMS));
  const ipi = firstGroup(asRecord(asRecord(imposto.IPI)?.IPITrib) ? asRecord(imposto.IPI) : null);
  const pis = firstGroup(asRecord(imposto.PIS));
  const cofins = firstGroup(asRecord(imposto.COFINS));

  return {
    numeroItem: Number(strOrDefault(det['@nItem'], String(idx + 1))),
    codigo: strOrDefault(prod.cProd, ''),
    descricao: strOrDefault(prod.xProd, ''),
    ncm: strOrDefault(prod.NCM, ''),
    cest: strOrNull(prod.CEST),
    cfop: strOrDefault(prod.CFOP, ''),
    unidadeComercial: strOrDefault(prod.uCom, 'UN'),
    quantidadeComercial: strOrDefault(prod.qCom, '0'),
    valorUnitario: strOrDefault(prod.vUnCom, '0'),
    valorTotal: strOrDefault(prod.vProd, '0.00'),
    valorDesconto: strOrDefault(prod.vDesc, '0'),
    valorFrete: strOrDefault(prod.vFrete, '0'),
    valorSeguro: strOrDefault(prod.vSeg, '0'),
    valorOutros: strOrDefault(prod.vOutro, '0'),
    origemMercadoria: icms ? numOrNull(icms.orig) : null,
    cstIcms: icms ? strOrNull(icms.CST) : null,
    csosnIcms: icms ? strOrNull(icms.CSOSN) : null,
    baseIcms: icms ? strOrNull(icms.vBC) : null,
    aliqIcms: icms ? strOrNull(icms.pICMS) : null,
    valorIcms: icms ? strOrNull(icms.vICMS) : null,
    cstIpi: ipi ? strOrNull(ipi.CST) : null,
    baseIpi: ipi ? strOrNull(ipi.vBC) : null,
    aliqIpi: ipi ? strOrNull(ipi.pIPI) : null,
    valorIpi: ipi ? strOrNull(ipi.vIPI) : null,
    cstPis: pis ? strOrNull(pis.CST) : null,
    basePis: pis ? strOrNull(pis.vBC) : null,
    aliqPis: pis ? strOrNull(pis.pPIS) : null,
    valorPis: pis ? strOrNull(pis.vPIS) : null,
    cstCofins: cofins ? strOrNull(cofins.CST) : null,
    baseCofins: cofins ? strOrNull(cofins.vBC) : null,
    aliqCofins: cofins ? strOrNull(cofins.pCOFINS) : null,
    valorCofins: cofins ? strOrNull(cofins.vCOFINS) : null,
  };
}

const FINALIDADE_POR_CODIGO: Record<string, FinalidadeNFe> = {
  '1': FinalidadeNFe.NORMAL,
  '2': FinalidadeNFe.COMPLEMENTAR,
  '3': FinalidadeNFe.AJUSTE,
  '4': FinalidadeNFe.DEVOLUCAO,
  '5': FinalidadeNFe.NOTA_CREDITO,
  '6': FinalidadeNFe.NOTA_DEBITO,
};

/** Grupos como ICMS/PIS/COFINS têm um único filho (ICMS00, PISAliq, …). Devolve esse filho. */
function firstGroup(group: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!group) return null;
  for (const value of Object.values(group)) {
    const rec = asRecord(value);
    if (rec) return rec;
  }
  return null;
}

function chaveFromId(value: unknown): string {
  const chave = String(value ?? '').replace(/NFe/i, '').replace(/\D/g, '');
  if (!/^\d{44}$/.test(chave)) throw new Error('NF-e sem chave de acesso válida (44 dígitos)');
  return chave;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function findRecursive(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return null;
  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];
  for (const value of Object.values(record)) {
    const found = findRecursive(value, key);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function strOrNull(value: unknown): string | null {
  const text = str(value);
  return text || null;
}

function strOrDefault(value: unknown, fallback: string): string {
  const text = str(value);
  return text || fallback;
}

function onlyDigits(value: unknown): string {
  const digits = str(value).replace(/\D/g, '');
  if (!digits) throw new Error('XML sem CNPJ/CPF do emitente');
  return digits;
}

function onlyDigitsOrNull(value: unknown): string | null {
  const digits = str(value).replace(/\D/g, '');
  return digits || null;
}

function numOrNull(value: unknown): number | null {
  const text = str(value);
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function dateOrNow(value: unknown): Date {
  const date = new Date(str(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateOrNull(value: unknown): Date | null {
  const text = str(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

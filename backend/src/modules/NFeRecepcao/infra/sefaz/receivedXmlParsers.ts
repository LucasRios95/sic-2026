import { XMLParser } from 'fast-xml-parser';

import { TipoDFe } from '../../domain/nfe-recepcao-enums';

export interface ParsedReceivedXml {
  tipo: TipoDFe;
  chaveAcesso: string;
  numero: string | null;
  serie: string | null;
  emitenteCnpj: string;
  emitenteNome: string;
  emitenteUf: string | null;
  destinatarioCnpj: string | null;
  dhEmissao: Date;
  valorTotal: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
});

export function parseReceivedXml(xml: string): ParsedReceivedXml {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const nfe = asRecord(findRecursive(parsed, 'NFe'));
  if (nfe) return parseProcNFe(nfe);

  const cte = asRecord(findRecursive(parsed, 'CTe'));
  if (cte) return parseCTe(cte);

  throw new Error('XML não reconhecido como NF-e ou CT-e');
}

export function parseProcNFe(nfeNode: Record<string, unknown>): ParsedReceivedXml {
  const infNFe = asRecord(nfeNode.infNFe);
  if (!infNFe) throw new Error('NF-e sem infNFe');

  const chaveAcesso = chaveFromId(infNFe['@Id'], 'NFe');
  ensureModelo(chaveAcesso, '55');

  const ide = asRecord(infNFe.ide) ?? {};
  const emit = asRecord(infNFe.emit) ?? {};
  const dest = asRecord(infNFe.dest) ?? {};
  const total = asRecord(asRecord(infNFe.total)?.ICMSTot) ?? {};
  const enderEmit = asRecord(emit.enderEmit) ?? {};

  return {
    tipo: TipoDFe.NFE_55,
    chaveAcesso,
    numero: stringOrNull(ide.nNF),
    serie: stringOrNull(ide.serie),
    emitenteCnpj: onlyDigits(emit.CNPJ),
    emitenteNome: requiredString(emit.xNome, 'NF-e sem emit/xNome'),
    emitenteUf: stringOrNull(enderEmit.UF),
    destinatarioCnpj: onlyDigitsOrNull(dest.CNPJ),
    dhEmissao: dateOrNow(ide.dhEmi),
    valorTotal: stringOrDefault(total.vNF, '0.00'),
  };
}

export function parseCTe(cteNode: Record<string, unknown>): ParsedReceivedXml {
  const infCte = asRecord(cteNode.infCte);
  if (!infCte) throw new Error('CT-e sem infCte');

  const chaveAcesso = chaveFromId(infCte['@Id'], 'CTe');
  ensureModelo(chaveAcesso, '57');

  const ide = asRecord(infCte.ide) ?? {};
  const emit = asRecord(infCte.emit) ?? {};
  const dest = asRecord(infCte.dest) ?? {};
  const enderEmit = asRecord(emit.enderEmit) ?? {};
  const vPrest = asRecord(infCte.vPrest) ?? {};

  return {
    tipo: TipoDFe.CTE_57,
    chaveAcesso,
    numero: stringOrNull(ide.nCT),
    serie: stringOrNull(ide.serie),
    emitenteCnpj: onlyDigits(emit.CNPJ),
    emitenteNome: requiredString(emit.xNome, 'CT-e sem emit/xNome'),
    emitenteUf: stringOrNull(enderEmit.UF),
    destinatarioCnpj: onlyDigitsOrNull(dest.CNPJ),
    dhEmissao: dateOrNow(ide.dhEmi),
    valorTotal: stringOrDefault(vPrest.vTPrest, '0.00'),
  };
}

function chaveFromId(value: unknown, prefix: 'NFe' | 'CTe'): string {
  const raw = String(value ?? '');
  const chave = raw.replace(prefix, '').replace(/\D/g, '');
  if (!/^\d{44}$/.test(chave)) {
    throw new Error(`${prefix} sem chave de acesso válida`);
  }
  return chave;
}

function ensureModelo(chave: string, expected: '55' | '57'): void {
  const modelo = chave.slice(20, 22);
  if (modelo !== expected) {
    throw new Error(`Modelo ${modelo || 'desconhecido'} não suportado neste importador`);
  }
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
    if (found !== null) return found;
  }
  return null;
}

function onlyDigits(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) throw new Error('XML sem CNPJ do emitente');
  return digits;
}

function onlyDigitsOrNull(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
}

function requiredString(value: unknown, message: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(message);
  return text;
}

function stringOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function stringOrDefault(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function dateOrNow(value: unknown): Date {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

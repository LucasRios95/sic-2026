/**
 * Normalizadores para o import do dump legado `sic_nfe`.
 *
 * O legado é MySQL latin1 com formatação inconsistente:
 *  - CNPJ/CPF e CEP misturam só dígitos e formatado
 *  - UF aparece como código IBGE numérico (35 = SP, 31 = MG, ...)
 *  - Texto vem com `?` no lugar de acentos (corrompido no dump — sem recuperação)
 *  - IE livre, com `ISENTO` indicando que o destinatário não tem IE
 */

import { isValidCnpj, isValidCpf, normalizeDigits } from '@shared/utils/document-validators';

/** Mapa código IBGE da UF -> sigla. Cobre as 27 UFs + DF. */
export const UF_CODE_TO_SIGLA: Readonly<Record<number, string>> = Object.freeze({
  11: 'RO',
  12: 'AC',
  13: 'AM',
  14: 'RR',
  15: 'PA',
  16: 'AP',
  17: 'TO',
  21: 'MA',
  22: 'PI',
  23: 'CE',
  24: 'RN',
  25: 'PB',
  26: 'PE',
  27: 'AL',
  28: 'SE',
  29: 'BA',
  31: 'MG',
  32: 'ES',
  33: 'RJ',
  35: 'SP',
  41: 'PR',
  42: 'SC',
  43: 'RS',
  50: 'MS',
  51: 'MT',
  52: 'GO',
  53: 'DF',
});

export function ufFromCode(code: unknown): string | null {
  const n = typeof code === 'number' ? code : Number(code);
  if (!Number.isFinite(n)) return null;
  return UF_CODE_TO_SIGLA[n] ?? null;
}

/** Devolve só dígitos do CEP. CEP inválido (tamanho != 8) retorna null. */
export function normalizeCep(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = normalizeDigits(String(value));
  if (digits.length !== 8) return null;
  return digits;
}

/**
 * Detecta o tipo de pessoa olhando para o documento.
 *   - 14 dígitos -> PJ (valida DV)
 *   - 11 dígitos -> PF (valida DV)
 *   - outros     -> null + razão
 */
export type DocCheck =
  | { tipo: 'PJ'; cnpjCpf: string }
  | { tipo: 'PF'; cnpjCpf: string }
  | { tipo: null; reason: string };

export function classifyDocument(raw: unknown): DocCheck {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { tipo: null, reason: 'documento vazio' };
  }
  const digits = normalizeDigits(String(raw));

  if (digits.length === 14) {
    if (!isValidCnpj(digits)) return { tipo: null, reason: `CNPJ inválido (DV): ${digits}` };
    return { tipo: 'PJ', cnpjCpf: digits };
  }

  if (digits.length === 11) {
    if (!isValidCpf(digits)) return { tipo: null, reason: `CPF inválido (DV): ${digits}` };
    return { tipo: 'PF', cnpjCpf: digits };
  }

  return { tipo: null, reason: `documento com ${digits.length} dígitos (esperado 11 ou 14)` };
}

/** Trunca strings preservando o limite do banco. Strings vazias viram fallback (default null). */
export function truncate(
  value: unknown,
  max: number,
  fallbackEmpty: string | null = null,
): string | null {
  if (value === null || value === undefined) return fallbackEmpty;
  const s = String(value).trim();
  if (s === '') return fallbackEmpty;
  return s.length > max ? s.slice(0, max) : s;
}

/** Remove caracteres de controle ASCII. Preserva acentos e espaços. */
export function sanitizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\u0000-\u001F\u007F]/g;
  const s = String(value).replace(controlChars, ' ').trim();
  return s === '' ? null : s;
}

export interface LegacyJuridico {
  nome: string | null;
  razaoSocial: string | null;
  ie: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  ufCode: number | null;
  telefone: string | null;
  email: string | null;
  regime: string | null;
  fkMunicipio: string | null;
  fkPais: number | null;
  pkClienteJuridico: number | null;
  cliente: string | null;
  cnpjCpf: string | null;
}

/** Mapeia tuplas do tab_juridico conforme a ordem das colunas no CREATE TABLE. */
export function readLegacyJuridico(row: readonly unknown[]): LegacyJuridico {
  return {
    nome: asString(row[0]),
    razaoSocial: asString(row[1]),
    ie: asString(row[2]),
    endereco: asString(row[3]),
    numero: asString(row[4]),
    complemento: asString(row[5]),
    bairro: asString(row[6]),
    cep: asString(row[7]),
    ufCode: asNumber(row[8]),
    telefone: asString(row[9]),
    email: asString(row[11]),
    regime: asString(row[13]),
    fkMunicipio: asString(row[15]),
    fkPais: asNumber(row[16]),
    pkClienteJuridico: asNumber(row[17]),
    cliente: asString(row[18]),
    cnpjCpf: asString(row[21]),
  };
}

export interface LegacyProduto {
  id: number;
  descricao: string | null;
  unidade: string | null;
  ncm: number | null;
  valorCusto: number | null;
  codigoBarras: string | null;
  cfopSaida: string | null;
}

export function readLegacyProduto(row: readonly unknown[]): LegacyProduto {
  return {
    id: asNumber(row[0]) ?? 0,
    descricao: asString(row[3]),
    unidade: asString(row[5]),
    valorCusto: asNumber(row[8]),
    ncm: asNumber(row[17]),
    codigoBarras: asString(row[16]),
    cfopSaida: asString(row[46]),
  };
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

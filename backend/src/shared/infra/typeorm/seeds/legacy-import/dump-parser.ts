import { readFile } from 'node:fs/promises';

/**
 * Parser mínimo de dumps MySQL: extrai os INSERTs por tabela e devolve cada
 * registro como array de valores (string | number | null). Não é um parser SQL
 * completo — assume o formato que o `mysqldump` emite (uma ou múltiplas
 * `INSERT INTO \`t\` VALUES (...),(...);` por tabela).
 *
 * Encoding: o dump-alvo (sic_nfe) declara `CHARSET=latin1` no CREATE TABLE mas
 * os bytes reais são UTF-8 (típica configuração de MySQL legado: `SET NAMES utf8`
 * antes dos INSERTs, mas a tabela mantém o charset declarado por compatibilidade).
 * Por isso lemos como UTF-8 — só assim acentos vêm corretos. Se um dump
 * realmente em latin1 aparecer no futuro, basta exportar `LEGACY_DUMP_ENCODING=latin1`.
 */

export type DumpValue = string | number | null;
export type DumpRow = DumpValue[];

export class MysqlDump {
  constructor(private readonly content: string) {}

  static async fromFile(path: string): Promise<MysqlDump> {
    const buf = await readFile(path);
    const encoding = (process.env.LEGACY_DUMP_ENCODING ?? 'utf-8').toLowerCase();
    const text =
      encoding === 'latin1' || encoding === 'iso-8859-1'
        ? buf.toString('latin1')
        : buf.toString('utf-8');
    return new MysqlDump(text);
  }

  /** Retorna a estrutura CREATE TABLE bruta (sem parsing). */
  createTable(table: string): string | null {
    const re = new RegExp(
      'CREATE TABLE `' + escapeRe(table) + '` \\(([\\s\\S]+?)\\) ENGINE=',
      'm',
    );
    const m = re.exec(this.content);
    return m ? m[1] : null;
  }

  /**
   * Extrai todos os registros de `INSERT INTO \`<table>\` VALUES ...;` —
   * varre o dump inteiro porque o mysqldump pode quebrar em múltiplos
   * INSERTs (-> --extended-insert=false ou limite de 4MB por statement).
   */
  rows(table: string): DumpRow[] {
    const re = new RegExp(
      'INSERT INTO `' + escapeRe(table) + '` VALUES ([\\s\\S]*?);\\s*\\n',
      'g',
    );
    const out: DumpRow[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.content)) !== null) {
      parseValuesInto(m[1], out);
    }
    return out;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decodifica a lista `(...)(...)...` que sai do mysqldump. Implementação
 * caractere-a-caractere por causa de strings que podem conter `\'`, `\\`,
 * vírgulas, parênteses e quebras de linha.
 */
function parseValuesInto(input: string, out: DumpRow[]): void {
  let i = 0;
  const n = input.length;
  while (i < n) {
    // pula whitespace e vírgulas entre tuplas
    while (i < n && (input[i] === ',' || isSpace(input[i]))) i++;
    if (i >= n) break;
    if (input[i] !== '(') {
      throw new Error(`parser: esperava '(' na posição ${i}, achei '${input[i]}'`);
    }
    i++; // consome '('

    const row: DumpRow = [];
    while (i < n) {
      // pula whitespace antes de cada valor
      while (i < n && isSpace(input[i])) i++;
      if (input[i] === ')') break;

      if (input[i] === "'") {
        // string entre aspas simples — escape via \' e \\
        i++; // consome aspas inicial
        let s = '';
        while (i < n) {
          const c = input[i];
          if (c === '\\') {
            const next = input[i + 1];
            switch (next) {
              case "'":
                s += "'";
                break;
              case '\\':
                s += '\\';
                break;
              case 'n':
                s += '\n';
                break;
              case 'r':
                s += '\r';
                break;
              case 't':
                s += '\t';
                break;
              case '0':
                s += '\0';
                break;
              case '"':
                s += '"';
                break;
              default:
                s += next ?? '';
            }
            i += 2;
            continue;
          }
          if (c === "'") {
            // Aspas dupla escapada em MySQL legado: '' (raro, mas existe)
            if (input[i + 1] === "'") {
              s += "'";
              i += 2;
              continue;
            }
            i++; // fecha string
            break;
          }
          s += c;
          i++;
        }
        row.push(s);
      } else if (input[i] === 'N' && input.substr(i, 4) === 'NULL') {
        row.push(null);
        i += 4;
      } else {
        // número (int/decimal) ou identificador booleano (raro)
        let s = '';
        while (i < n && input[i] !== ',' && input[i] !== ')') {
          s += input[i];
          i++;
        }
        const trimmed = s.trim();
        const num = Number(trimmed);
        row.push(Number.isFinite(num) && trimmed !== '' ? num : trimmed);
      }

      // separador entre valores: vírgula opcional
      while (i < n && isSpace(input[i])) i++;
      if (input[i] === ',') i++;
    }

    if (input[i] !== ')') {
      throw new Error(`parser: esperava ')' na posição ${i}`);
    }
    i++; // consome ')'
    out.push(row);
  }
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

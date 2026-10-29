import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Client } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import ncmRaw from '../data/ncm-vigente.json';
import { TODAS_UFS } from '../tax-globals';

/**
 * Importa regras de MVA de ICMS-ST de um CSV compacto para `icms_st_mva`.
 *
 * Cada linha do CSV é uma REGRA (uma UF destino, várias UFs origem, vários NCMs) e
 * é expandida em linhas (uf_origem, uf_destino, ncm). Colunas (separador `;`):
 *
 *   status            CONFIRMADO | PENDENTE — linhas PENDENTE são ignoradas.
 *   uf_destino        UF que exige a ST.
 *   ufs_origem        UFs separadas por `|`, ou `*` para todas as 27 (inclui a própria
 *                     UF destino = operação interna).
 *   ncms              NCMs separados por `|`. Com 8 dígitos entra como está; com menos,
 *                     expande para todas as folhas de 8 dígitos vigentes na tabela NCM.
 *   mva_original      MVA original em % (ex.: 29.04).
 *   mva_original_importado  Opcional: MVA original própria de mercadoria importada (ex.: MG);
 *                     é a base da MVA ajustada 4%. Vazia → usa mva_original.
 *   aliq_interna_dest Alíquota interna do produto no destino, em %, para a MVA ajustada.
 *                     Vazia → usa `icms_interna_uf` vigente em valid_from.
 *   ajusta_mva        S | N — se a UF destino exige MVA ajustada nas interestaduais.
 *   mva_aj_4, mva_aj_7, mva_aj_12  Opcionais: MVA ajustada PUBLICADA pela UF destino.
 *                     Quando preenchidas, prevalecem sobre a fórmula (evita divergência
 *                     de arredondamento com a tabela oficial).
 *   descricao, protocolo, valid_from (AAAA-MM-DD), valid_to (vazio = aberta), fonte_norma.
 *
 * MVA ajustada (Conv. ICMS 142/2018, cl. 13ª; antigo Conv. 35/2011):
 *   [(1 + MVA_orig) × (1 − ALQ_inter) / (1 − ALQ_intra)] − 1
 * Quando ALQ_intra ≤ ALQ_inter a fórmula reduziria a margem — mantém a MVA original.
 *
 * Idempotente: UPSERT por (uf_origem, uf_destino, ncm, valid_from). Transacional e
 * dry-run por padrão (ROLLBACK no fim); DRY_RUN=false faz COMMIT.
 *
 * Execução:
 *   IMPORT_DATABASE_URL="postgresql://user:pass@host:port/db" \
 *   MVA_CSV_PATH=src/shared/infra/typeorm/seeds/data/icms-st-mva-vinhos.csv \
 *   DRY_RUN=true npm run import:mva
 */

const CSV_PATH =
  process.env.MVA_CSV_PATH ??
  resolve(process.cwd(), 'src', 'shared', 'infra', 'typeorm', 'seeds', 'data', 'icms-st-mva-vinhos.csv');
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const DB_URL = process.env.IMPORT_DATABASE_URL ?? '';
const DB_SSL = (process.env.IMPORT_DB_SSL ?? 'true').toLowerCase() !== 'false';

const SUDESTE_SUL_EXC_ES = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'];
const UF_SET = new Set<string>(TODAS_UFS);

interface Regra {
  linha: number;
  status: string;
  ufDestino: string;
  ufsOrigem: string[];
  ncms: string[];
  mvaOriginal: number;
  mvaOriginalImportado: number | null;
  aliqInternaDest: number | null;
  ajustaMva: boolean;
  publicadas: Record<4 | 7 | 12, number | null>;
  descricao: string | null;
  protocolo: string | null;
  validFrom: string;
  validTo: string | null;
  fonteNorma: string | null;
}

interface LinhaMva {
  ufOrigem: string;
  ufDestino: string;
  ncm: string;
  descricao: string | null;
  mvaOriginal: string;
  mvaAjustada4: string | null;
  mvaAjustada7: string | null;
  mvaAjustada12: string | null;
  protocolo: string | null;
  validFrom: string;
  validTo: string | null;
  fonteNorma: string | null;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Parser mínimo de CSV com `;`, aspas duplas e `""` como escape. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

function num(v: string, campo: string, linha: number): number {
  const n = Number(v.trim().replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`linha ${linha}: ${campo} inválido ("${v}")`);
  return n;
}

function txt(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

function parseRegras(text: string): Regra[] {
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ''));
  const idx = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const col = (r: string[], nome: string) => {
    const i = idx.get(nome);
    if (i === undefined) throw new Error(`coluna "${nome}" ausente no CSV`);
    return r[i] ?? '';
  };

  return body.map((r, i) => {
    const linha = i + 2;
    const ufDestino = col(r, 'uf_destino').trim().toUpperCase();
    if (!UF_SET.has(ufDestino)) throw new Error(`linha ${linha}: uf_destino inválida ("${ufDestino}")`);
    const origemRaw = col(r, 'ufs_origem').trim().toUpperCase();
    const ufsOrigem = origemRaw === '*' ? [...TODAS_UFS] : origemRaw.split('|').map((u) => u.trim());
    for (const u of ufsOrigem) {
      if (!UF_SET.has(u)) throw new Error(`linha ${linha}: UF de origem inválida ("${u}")`);
    }
    const validFrom = col(r, 'valid_from').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
      throw new Error(`linha ${linha}: valid_from deve ser AAAA-MM-DD ("${validFrom}")`);
    }
    const aliq = txt(col(r, 'aliq_interna_dest'));
    const mvaImp = txt(col(r, 'mva_original_importado'));
    const publicada = (nome: string) => {
      const v = txt(col(r, nome));
      return v === null ? null : num(v, nome, linha);
    };
    return {
      linha,
      status: col(r, 'status').trim().toUpperCase(),
      ufDestino,
      ufsOrigem,
      ncms: expandirNcms(col(r, 'ncms'), linha),
      mvaOriginal: num(col(r, 'mva_original'), 'mva_original', linha),
      mvaOriginalImportado: mvaImp === null ? null : num(mvaImp, 'mva_original_importado', linha),
      aliqInternaDest: aliq === null ? null : num(aliq, 'aliq_interna_dest', linha),
      ajustaMva: col(r, 'ajusta_mva').trim().toUpperCase() === 'S',
      publicadas: { 4: publicada('mva_aj_4'), 7: publicada('mva_aj_7'), 12: publicada('mva_aj_12') },
      descricao: txt(col(r, 'descricao')),
      protocolo: txt(col(r, 'protocolo')),
      validFrom,
      validTo: txt(col(r, 'valid_to')),
      fonteNorma: txt(col(r, 'fonte_norma')),
    };
  });
}

// ---------------------------------------------------------------------------
// NCM e MVA ajustada
// ---------------------------------------------------------------------------

/** Folhas de 8 dígitos vigentes na tabela NCM (Data_Fim no futuro). */
const NCM_FOLHAS: string[] = (() => {
  const hoje = new Date();
  return (ncmRaw as { Nomenclaturas: Array<{ Codigo: string; Data_Fim: string }> }).Nomenclaturas
    .filter((n) => {
      const [d, m, a] = n.Data_Fim.split('/').map(Number);
      return new Date(a, m - 1, d) >= hoje;
    })
    .map((n) => n.Codigo.replace(/\D/g, ''))
    .filter((c) => c.length === 8);
})();

function expandirNcms(raw: string, linha: number): string[] {
  const out = new Set<string>();
  for (const tok of raw.split('|').map((t) => t.replace(/\D/g, ''))) {
    if (tok === '') continue;
    if (tok.length === 8) {
      out.add(tok);
      continue;
    }
    const folhas = NCM_FOLHAS.filter((c) => c.startsWith(tok));
    if (folhas.length === 0) throw new Error(`linha ${linha}: NCM "${tok}" sem folhas vigentes`);
    folhas.forEach((c) => out.add(c));
  }
  if (out.size === 0) throw new Error(`linha ${linha}: nenhum NCM informado`);
  return [...out];
}

function mvaAjustada(mvaOriginal: number, aliqInter: number, aliqIntra: number): string {
  if (aliqIntra <= aliqInter) return mvaOriginal.toFixed(4);
  const fator = ((1 + mvaOriginal / 100) * (1 - aliqInter / 100)) / (1 - aliqIntra / 100);
  return ((fator - 1) * 100).toFixed(4);
}

function expandir(regra: Regra, aliqIntra: number): LinhaMva[] {
  const ajustada = (aliqInter: 4 | 7 | 12, mvaBase: number) => {
    const pub = regra.publicadas[aliqInter];
    return pub !== null ? pub.toFixed(4) : mvaAjustada(mvaBase, aliqInter, aliqIntra);
  };
  const linhas: LinhaMva[] = [];
  for (const ufOrigem of regra.ufsOrigem) {
    const interestadual = ufOrigem !== regra.ufDestino;
    const ajusta = interestadual && regra.ajustaMva;
    const aliqNacional =
      SUDESTE_SUL_EXC_ES.includes(ufOrigem) && !SUDESTE_SUL_EXC_ES.includes(regra.ufDestino) ? 7 : 12;
    for (const ncm of regra.ncms) {
      linhas.push({
        ufOrigem,
        ufDestino: regra.ufDestino,
        ncm,
        descricao: regra.descricao,
        mvaOriginal: regra.mvaOriginal.toFixed(4),
        mvaAjustada4: ajusta ? ajustada(4, regra.mvaOriginalImportado ?? regra.mvaOriginal) : null,
        // Só a alíquota interestadual do par se aplica; a outra fica nula.
        mvaAjustada7: ajusta && aliqNacional === 7 ? ajustada(7, regra.mvaOriginal) : null,
        mvaAjustada12: ajusta && aliqNacional === 12 ? ajustada(12, regra.mvaOriginal) : null,
        protocolo: regra.protocolo,
        validFrom: regra.validFrom,
        validTo: regra.validTo,
        fonteNorma: regra.fonteNorma,
      });
    }
  }
  return linhas;
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

async function aliqInternaVigente(client: Client, uf: string, em: string): Promise<number | null> {
  const { rows } = await client.query<{ aliq_interna: string }>(
    `SELECT aliq_interna FROM icms_interna_uf
      WHERE uf = $1 AND valid_from <= $2::timestamptz AND (valid_to IS NULL OR valid_to > $2::timestamptz)
      ORDER BY valid_from DESC LIMIT 1`,
    [uf, em],
  );
  return rows[0] ? Number(rows[0].aliq_interna) : null;
}

const COLUNAS = [
  'id', 'uf_origem', 'uf_destino', 'ncm', 'descricao', 'mva_original', 'mva_ajustada_4',
  'mva_ajustada_7', 'mva_ajustada_12', 'protocolo', 'valid_from', 'valid_to', 'fonte_norma',
];

/** UPSERT em chunks — poucos round-trips pelo proxy remoto. Retorna quantas eram novas. */
async function upsert(client: Client, linhas: LinhaMva[]): Promise<number> {
  let inseridas = 0;
  const CHUNK = 500;
  for (let i = 0; i < linhas.length; i += CHUNK) {
    const chunk = linhas.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuplas = chunk.map((l) => {
      const base = params.length;
      params.push(
        uuidv7(), l.ufOrigem, l.ufDestino, l.ncm, l.descricao, l.mvaOriginal, l.mvaAjustada4,
        l.mvaAjustada7, l.mvaAjustada12, l.protocolo, l.validFrom, l.validTo, l.fonteNorma,
      );
      return `(${COLUNAS.map((_, j) => `$${base + j + 1}`).join(', ')}, now(), now())`;
    });
    const { rows } = await client.query<{ inserted: boolean }>(
      `INSERT INTO icms_st_mva (${COLUNAS.join(', ')}, created_at, updated_at)
       VALUES ${tuplas.join(',\n')}
       ON CONFLICT (uf_origem, uf_destino, ncm, valid_from) DO UPDATE SET
         descricao = EXCLUDED.descricao,
         mva_original = EXCLUDED.mva_original,
         mva_ajustada_4 = EXCLUDED.mva_ajustada_4,
         mva_ajustada_7 = EXCLUDED.mva_ajustada_7,
         mva_ajustada_12 = EXCLUDED.mva_ajustada_12,
         protocolo = EXCLUDED.protocolo,
         valid_to = EXCLUDED.valid_to,
         fonte_norma = EXCLUDED.fonte_norma,
         updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      params,
    );
    inseridas += rows.filter((r) => r.inserted).length;
  }
  return inseridas;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  if (!DB_URL) {
    throw new Error('Defina IMPORT_DATABASE_URL com a connection string do Postgres de destino.');
  }
  console.log(`Lendo CSV: ${CSV_PATH}`);
  const regras = parseRegras(await readFile(CSV_PATH, 'utf8'));
  const ativas = regras.filter((r) => r.status === 'CONFIRMADO');
  const pendentes = regras.filter((r) => r.status !== 'CONFIRMADO');

  const client = new Client({
    connectionString: DB_URL,
    ssl: DB_SSL ? { rejectUnauthorized: false } : undefined,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000,
    connectionTimeoutMillis: 30000,
    statement_timeout: 120000,
    query_timeout: 120000,
  });
  await client.connect();
  console.log(`Conectado ao Postgres de destino. Modo: ${DRY_RUN ? 'DRY-RUN' : 'COMMIT'}`);

  await client.query('BEGIN');
  try {
    const linhas: LinhaMva[] = [];
    for (const regra of ativas) {
      let aliqIntra = regra.aliqInternaDest;
      if (aliqIntra === null && regra.ajustaMva) {
        aliqIntra = await aliqInternaVigente(client, regra.ufDestino, regra.validFrom);
        if (aliqIntra === null) {
          throw new Error(
            `linha ${regra.linha}: sem aliq_interna_dest e sem icms_interna_uf para ${regra.ufDestino}`,
          );
        }
      }
      linhas.push(...expandir(regra, aliqIntra ?? 0));
    }
    const inseridas = await upsert(client, linhas);

    const line = '─'.repeat(64);
    console.log('\n' + line);
    console.log(`  IMPORT ICMS-ST MVA — ${DRY_RUN ? 'DRY-RUN (rollback)' : 'COMMIT'}`);
    console.log(line);
    console.log(`  regras no CSV: ${regras.length} | confirmadas: ${ativas.length} | pendentes (ignoradas): ${pendentes.length}`);
    for (const p of pendentes) console.log(`    - linha ${p.linha} ${p.ufDestino}: ${p.status}`);
    console.log(`  linhas expandidas: ${linhas.length} | inseridas: ${inseridas} | atualizadas: ${linhas.length - inseridas}`);
    const porDestino = new Map<string, number>();
    for (const l of linhas) porDestino.set(l.ufDestino, (porDestino.get(l.ufDestino) ?? 0) + 1);
    console.log(`  por UF destino: ${[...porDestino].map(([uf, n]) => `${uf}=${n}`).join(' ')}`);
    console.log(line + '\n');

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN: transação revertida (nada gravado).');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT: dados gravados.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Erro fatal — rollback aplicado:', err);
    await client.end();
    throw err;
  }
  await client.end();
}

run().catch((err) => {
  console.error('Falha no import de MVA:', err);
  process.exit(1);
});

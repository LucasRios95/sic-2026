import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Client } from 'pg';

import {
  isValidCnpj,
  isValidCpf,
  normalizeDigits,
} from '@shared/utils/document-validators';

import { MysqlDump, type DumpValue } from '../legacy-import/dump-parser';
import {
  UF_CODE_TO_SIGLA,
  classifyDocument,
  normalizeCep,
  sanitizeText,
  truncate,
} from '../legacy-import/transformers';

/**
 * Importação do dump legado `sic_padrao` (MySQL) da VINHOS CANGUERA LTDA para o
 * schema novo (Postgres). Importa, nesta ordem:
 *
 *   1. Tenant + Company (CNPJ 55.610.836/0001-08) — Simples Nacional.
 *   2. Clientes: `tab_juridico` (PJ) + `tab_fisico` (PF) -> `customers`.
 *   3. Fornecedores: `tab_fornecedor` -> `suppliers`.
 *   4. Produtos: `tab_produto` -> `products` (+ `product_tax_rules` baseline SN).
 *   5. NF-e: `notafiscalnfe` (cabeçalho) + `nfitens` (itens) do período
 *      [2026-01-01 .. hoje] -> `nfes` (+ `nfe_items`), como histórico AUTORIZADO
 *      somente-leitura (status AUTHORIZED/CANCELLED, sem retransmitir à SEFAZ).
 *
 * Características:
 *  - **Name-based**: lê cada linha do dump por NOME de coluna (a ordem difere
 *    entre versões do legado), nunca por posição fixa.
 *  - **Encoding**: o dump é UTF-8 válido; aplicamos NFC + remoção de controles.
 *  - **Idempotente**: UPSERT por chaves naturais (company+doc, company+codigo,
 *    company+modelo+serie+numero / chave de acesso).
 *  - **Transacional + dry-run**: tudo roda numa transação. Com DRY_RUN=true
 *    (padrão) faz ROLLBACK no fim e só reporta os números; com DRY_RUN=false
 *    faz COMMIT. Cada linha roda dentro de um SAVEPOINT — uma linha ruim é
 *    rejeitada e registrada sem abortar o lote.
 *
 * Execução:
 *   IMPORT_DATABASE_URL="postgresql://user:pass@host:port/db" \
 *   DRY_RUN=true npm run import:canguera
 */

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const DUMP_PATH =
  process.env.LEGACY_DUMP_PATH ?? resolve(process.cwd(), '..', 'dumps', 'Dump20260611.sql');
const REJECT_PATH =
  process.env.REJECT_REPORT_PATH ?? resolve(process.cwd(), 'tmp', 'canguera-import-rejeitados.csv');
const TENANT_SLUG = process.env.IMPORT_TENANT_SLUG ?? 'default';
const TENANT_NAME = process.env.IMPORT_TENANT_NAME ?? 'Vinhos Canguera';
const NFE_DESDE = process.env.IMPORT_NFE_DESDE ?? '2026-01-01';
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const DB_URL = process.env.IMPORT_DATABASE_URL ?? '';
const DB_SSL = (process.env.IMPORT_DB_SSL ?? 'true').toLowerCase() !== 'false';

const CANGUERA = {
  cnpj: '55610836000108',
  ie: '653002769119',
  razaoSocial: 'VINHOS CANGUERA LTDA.',
  nomeFantasia: 'VINHOS CANGUERA',
  logradouro: 'ESTRADA DO VINHO',
  numero: '8073',
  complemento: 'GALPAO 01',
  bairro: 'CANGUERA',
  codigoMunicipioIbge: '3550605', // São Roque-SP
  municipio: 'SÃO ROQUE',
  uf: 'SP',
  cep: '18145002',
  telefone: '1147111304',
  email: 'vinhoscanguera@terra.com.br',
  crt: 'SIMPLES_NACIONAL' as const,
} as const;

// CSOSN = 3 dígitos (Simples Nacional); CST de ICMS = 2 dígitos (regime normal).
const CSOSN_SET = new Set(['101', '102', '103', '201', '202', '203', '300', '400', '500', '900']);

// ---------------------------------------------------------------------------
// Tipos e estado do relatório
// ---------------------------------------------------------------------------

interface Reject {
  source: string;
  legacyId: string;
  reason: string;
  raw: string;
}

interface SectionStat {
  total: number;
  inserted: number;
  updated: number;
  rejected: number;
  warned: number;
}

const stats: Record<string, SectionStat> = {};
const rejects: Reject[] = [];
const warnings: Reject[] = [];

function stat(section: string): SectionStat {
  return (stats[section] ??= { total: 0, inserted: 0, updated: 0, rejected: 0, warned: 0 });
}

// ---------------------------------------------------------------------------
// Helpers de leitura do dump (por nome de coluna)
// ---------------------------------------------------------------------------

type Obj = Record<string, DumpValue>;

function columnNames(dump: MysqlDump, table: string): string[] {
  const body = dump.createTable(table);
  if (!body) throw new Error(`CREATE TABLE \`${table}\` não encontrado no dump`);
  const names: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^\s*`([^`]+)`\s/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

function objectRows(dump: MysqlDump, table: string): Obj[] {
  const cols = columnNames(dump, table);
  return dump.rows(table).map((r) => {
    const o: Obj = {};
    cols.forEach((c, i) => {
      o[c] = i < r.length ? r[i] : null;
    });
    return o;
  });
}

// ---------------------------------------------------------------------------
// Normalizadores
// ---------------------------------------------------------------------------

/** UTF-8 -> NFC, remove controles e o caractere de substituição (U+FFFD). */
function cleanText(v: DumpValue): string | null {
  if (v === null || v === undefined) return null;
  const stripped = sanitizeText(String(v));
  if (stripped === null) return null;
  const s = stripped.normalize('NFC').replace(/�/g, '').trim();
  return s === '' ? null : s;
}

function digits(v: DumpValue): string | null {
  if (v === null || v === undefined) return null;
  const d = normalizeDigits(String(v));
  return d === '' ? null : d;
}

/** Número como string para colunas numeric (preserva o valor; default opcional). */
function numStr(v: DumpValue, fallback: string | null = null): string | null {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? String(n) : fallback;
}

/** Resolve a sigla da UF a partir de: sigla literal, código IBGE da UF, ou código do município. */
function resolveUf(rawUf: DumpValue, ibgeMunicipio: string | null): string | null {
  const s = rawUf === null || rawUf === undefined ? '' : String(rawUf).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s) && Object.values(UF_CODE_TO_SIGLA).includes(s)) return s;
  const asCode = Number(s);
  if (Number.isFinite(asCode) && UF_CODE_TO_SIGLA[asCode]) return UF_CODE_TO_SIGLA[asCode];
  if (ibgeMunicipio && ibgeMunicipio.length >= 2) {
    const code = Number(ibgeMunicipio.slice(0, 2));
    if (UF_CODE_TO_SIGLA[code]) return UF_CODE_TO_SIGLA[code];
  }
  return null;
}

function mapCrt(v: DumpValue): string | null {
  const s = v === null || v === undefined ? '' : String(v).trim();
  switch (s) {
    case '1':
      return 'SIMPLES_NACIONAL';
    case '2':
      return 'SIMPLES_EXCESSO_SUBLIMITE';
    case '3':
      return 'REGIME_NORMAL';
    case '4':
      return 'MEI';
    default:
      return null;
  }
}

/** Separa um código de tributação de ICMS em (cst | csosn) conforme o número de dígitos. */
function splitIcmsCode(v: DumpValue): { cst: string | null; csosn: string | null } {
  const d = v === null || v === undefined ? '' : String(v).trim().replace(/\D/g, '');
  if (d === '') return { cst: null, csosn: null };
  if (d.length >= 3 || CSOSN_SET.has(d)) return { cst: null, csosn: d.padStart(3, '0').slice(0, 4) };
  return { cst: d.padStart(2, '0').slice(0, 4), csosn: null };
}

function ncm8(v: DumpValue): string | null {
  const d = v === null || v === undefined ? '' : String(v).split('.')[0].replace(/\D/g, '');
  if (d === '' || Number(d) === 0) return null;
  return d.padStart(8, '0').slice(0, 8);
}

// ---------------------------------------------------------------------------
// Contexto de banco com SAVEPOINT por linha
// ---------------------------------------------------------------------------

class Db {
  constructor(private readonly client: Client) {}

  async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number | null }> {
    const res = await this.client.query(text, params);
    return { rows: res.rows as T[], rowCount: res.rowCount };
  }

  /** Executa `fn` dentro de um SAVEPOINT; em erro, faz rollback ao savepoint e repassa. */
  async unit<T>(fn: () => Promise<T>): Promise<T> {
    await this.client.query('SAVEPOINT sp');
    try {
      const out = await fn();
      await this.client.query('RELEASE SAVEPOINT sp');
      return out;
    } catch (err) {
      await this.client.query('ROLLBACK TO SAVEPOINT sp');
      throw err;
    }
  }
}

interface BulkRow {
  key: string;
  values: unknown[];
}
interface BulkResult {
  byKey: Map<string, { id: string; inserted: boolean }>;
  inserted: number;
  updated: number;
  failures: Array<{ key: string; error: string }>;
}

/**
 * UPSERT em massa: insere `rows` em chunks de N tuplas por statement (poucos
 * round-trips no proxy remoto, em vez de um por linha). Cada chunk roda num
 * SAVEPOINT; se o chunk falhar (ex.: dado inesperado), cai para linha-a-linha
 * para isolar a culpada sem perder o lote. Mapeia o resultado por `keyCol`.
 */
async function bulkUpsert(
  db: Db,
  opts: {
    table: string;
    columns: string[];
    conflict: string;
    update: string[];
    keyCol: string;
    rows: BulkRow[];
    chunkSize?: number;
  },
): Promise<BulkResult> {
  const { table, columns, conflict, update, keyCol, rows } = opts;
  const chunkSize = opts.chunkSize ?? 200;
  const res: BulkResult = { byKey: new Map(), inserted: 0, updated: 0, failures: [] };
  const setClause = update.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

  const buildSql = (count: number): string => {
    const tuples: string[] = [];
    let p = 1;
    for (let i = 0; i < count; i++) {
      const ph = columns.map(() => `$${p++}`).join(', ');
      tuples.push(`(gen_random_uuid(), ${ph}, now(), now())`);
    }
    return (
      `INSERT INTO ${table} (id, ${columns.join(', ')}, created_at, updated_at) VALUES ${tuples.join(', ')} ` +
      `ON CONFLICT ${conflict} DO UPDATE SET ${setClause}, updated_at = now() ` +
      `RETURNING id, xmax::text AS xmax, ${keyCol} AS key`
    );
  };

  const applyRows = async (batch: BulkRow[]): Promise<void> => {
    const sql = buildSql(batch.length);
    const params = batch.flatMap((r) => r.values);
    const out = await db.query<{ id: string; xmax: string; key: string }>(sql, params);
    for (const row of out.rows) {
      const inserted = row.xmax === '0';
      res.byKey.set(String(row.key), { id: row.id, inserted });
      if (inserted) res.inserted++;
      else res.updated++;
    }
  };

  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    try {
      await db.unit(() => applyRows(batch));
    } catch {
      // Fallback linha-a-linha para isolar a tupla problemática.
      for (const r of batch) {
        try {
          await db.unit(() => applyRows([r]));
        } catch (err) {
          res.failures.push({ key: r.key, error: dbErr(err) });
        }
      }
    }
  }
  return res;
}

/** INSERT em massa simples (sem ON CONFLICT), com id/timestamps automáticos, em chunks. */
async function bulkInsertPlain(
  db: Db,
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    const tuples: string[] = [];
    let p = 1;
    for (let k = 0; k < batch.length; k++) {
      tuples.push(`(gen_random_uuid(), ${columns.map(() => `$${p++}`).join(', ')}, now(), now())`);
    }
    const sql = `INSERT INTO ${table} (id, ${columns.join(', ')}, created_at, updated_at) VALUES ${tuples.join(', ')}`;
    await db.unit(() => db.query(sql, batch.flat()));
  }
}

// ---------------------------------------------------------------------------
// Seções de importação
// ---------------------------------------------------------------------------

interface Target {
  companyId: string;
  tenantId: string;
  crt: string;
  created: boolean;
}

/**
 * Resolve a empresa de destino. Se a VINHOS CANGUERA já existir (criada/configurada
 * manualmente em produção), **reutiliza** a empresa e o tenant dela sem sobrescrever
 * nenhum campo — respeitando a configuração feita à mão (CRT, ambiente SEFAZ, flags).
 * Só cria tenant+company quando a empresa ainda não existe.
 */
async function resolveTarget(db: Db): Promise<Target> {
  const existing = await db.query<{ id: string; tenant_id: string; crt: string }>(
    `SELECT id, tenant_id, crt FROM companies WHERE cnpj = $1`,
    [CANGUERA.cnpj],
  );
  if (existing.rows.length > 0) {
    const c = existing.rows[0];
    return { companyId: c.id, tenantId: c.tenant_id, crt: c.crt, created: false };
  }

  // Empresa nova: usa o tenant do slug configurado (default = 'default', o tenant operante).
  const tFound = await db.query<{ id: string }>(`SELECT id FROM tenants WHERE slug = $1`, [TENANT_SLUG]);
  const tenantId =
    tFound.rows.length > 0
      ? tFound.rows[0].id
      : (
          await db.query<{ id: string }>(
            `INSERT INTO tenants (id, name, slug, active, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, true, now(), now()) RETURNING id`,
            [TENANT_NAME, TENANT_SLUG],
          )
        ).rows[0].id;

  const created = await db.query<{ id: string }>(
    `INSERT INTO companies (
       id, tenant_id, cnpj, razao_social, nome_fantasia, ie, crt,
       logradouro, numero, complemento, bairro, codigo_municipio_ibge, municipio, uf, cep,
       telefone, email, ambiente_sefaz, ambiente_focus_nfe, emite_nfe, emite_nfse,
       usa_icms, usa_icms_st, usa_ipi, usa_difal, usa_fcp, usa_icms_desonerado,
       active, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, 'HOMOLOGACAO', 'HOMOLOGACAO', true, false,
       true, true, false, false, false, false,
       true, now(), now()
     ) RETURNING id`,
    [
      tenantId, CANGUERA.cnpj, CANGUERA.razaoSocial, CANGUERA.nomeFantasia, CANGUERA.ie, CANGUERA.crt,
      CANGUERA.logradouro, CANGUERA.numero, CANGUERA.complemento, CANGUERA.bairro,
      CANGUERA.codigoMunicipioIbge, CANGUERA.municipio, CANGUERA.uf, CANGUERA.cep,
      CANGUERA.telefone, CANGUERA.email,
    ],
  );
  return { companyId: created.rows[0].id, tenantId, crt: CANGUERA.crt, created: true };
}

/** Mapa código IBGE do município -> nome (do próprio dump). */
function buildMunicipioMap(dump: MysqlDump): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of objectRows(dump, 'tab_municipio')) {
    const code = digits(m['PK_CODMUNICIPIO']);
    const nome = cleanText(m['NOME']);
    if (code && nome) map.set(code, nome);
  }
  return map;
}

interface PessoaInsert {
  tipoPessoa: 'PF' | 'PJ';
  cnpjCpf: string;
  nomeRazao: string;
  nomeFantasia: string | null;
  ie: string | null;
  indicadorIE: 'CONTRIBUINTE' | 'ISENTO' | 'NAO_CONTRIBUINTE';
  email: string | null;
  telefone: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
  crt: string | null;
}

/** Normaliza uma pessoa (cliente/fornecedor) a partir de campos já lidos por nome. */
function buildPessoa(
  source: string,
  legacyId: string,
  fields: {
    doc: DumpValue;
    nome: DumpValue;
    razao: DumpValue;
    ie: DumpValue;
    endereco: DumpValue;
    numero: DumpValue;
    complemento: DumpValue;
    bairro: DumpValue;
    cep: DumpValue;
    uf: DumpValue;
    fkMunicipio: DumpValue;
    email: DumpValue;
    telefone: DumpValue;
    crt?: DumpValue;
  },
  municipios: Map<string, string>,
): PessoaInsert | null {
  const doc = classifyDocument(fields.doc);
  if (doc.tipo === null) {
    rejects.push({ source, legacyId, reason: doc.reason, raw: `${cleanText(fields.razao ?? fields.nome) ?? ''}` });
    return null;
  }

  const nomeRazao = truncate(cleanText(fields.razao) ?? cleanText(fields.nome), 200);
  if (!nomeRazao) {
    rejects.push({ source, legacyId, reason: 'nome/razão social vazio', raw: `doc=${doc.cnpjCpf}` });
    return null;
  }

  const ibge = digits(fields.fkMunicipio);
  const codigoMunicipioIbge = ibge && /^\d{6,7}$/.test(ibge) ? ibge.padStart(7, '0') : null;
  const uf = resolveUf(fields.uf, codigoMunicipioIbge);
  if (!uf) {
    rejects.push({ source, legacyId, reason: `UF indeterminável (uf=${fields.uf}, ibge=${ibge})`, raw: nomeRazao });
    return null;
  }
  if (!codigoMunicipioIbge) {
    warnings.push({ source, legacyId, reason: `IBGE do município ausente/ inválido (${fields.fkMunicipio})`, raw: nomeRazao });
  }

  const cep = normalizeCep(fields.cep);
  if (!cep) {
    warnings.push({ source, legacyId, reason: `CEP inválido (${fields.cep}) — preenchido 00000000`, raw: nomeRazao });
  }

  const ieRaw = (cleanText(fields.ie) ?? '').toUpperCase();
  let indicadorIE: PessoaInsert['indicadorIE'];
  let ieFinal: string | null = null;
  if (doc.tipo === 'PF') {
    indicadorIE = 'NAO_CONTRIBUINTE';
  } else if (ieRaw === '' || ieRaw === 'ISENTO' || ieRaw === 'ISENTA') {
    indicadorIE = 'ISENTO';
  } else {
    indicadorIE = 'CONTRIBUINTE';
    ieFinal = truncate(digits(fields.ie) ?? ieRaw, 20);
  }

  const municipioNome =
    (codigoMunicipioIbge && municipios.get(codigoMunicipioIbge)) ||
    (codigoMunicipioIbge ? `MUN-${codigoMunicipioIbge}` : 'NÃO INFORMADO');

  return {
    tipoPessoa: doc.tipo,
    cnpjCpf: doc.cnpjCpf,
    nomeRazao,
    nomeFantasia: truncate(cleanText(fields.nome), 200),
    ie: ieFinal,
    indicadorIE,
    email: truncate(cleanText(fields.email), 150),
    telefone: truncate(digits(fields.telefone), 20),
    logradouro: truncate(cleanText(fields.endereco), 200) ?? 'NÃO INFORMADO',
    numero: truncate(cleanText(fields.numero), 20) ?? 'S/N',
    complemento: truncate(cleanText(fields.complemento), 100),
    bairro: truncate(cleanText(fields.bairro), 100) ?? 'CENTRO',
    codigoMunicipioIbge: codigoMunicipioIbge ?? '0000000',
    municipio: truncate(municipioNome, 100) ?? 'NÃO INFORMADO',
    uf,
    cep: cep ?? '00000000',
    crt: fields.crt !== undefined ? mapCrt(fields.crt) : null,
  };
}

const CUSTOMER_COLUMNS = [
  'company_id', 'tipo_pessoa', 'cnpj_cpf', 'nome_razao', 'nome_fantasia', 'ie', 'indicador_ie', 'email', 'telefone',
  'consumidor_final', 'indicador_presenca',
  'logradouro', 'numero', 'complemento', 'bairro', 'codigo_municipio_ibge', 'municipio', 'uf', 'cep',
  'pais', 'codigo_pais', 'bloqueado', 'active',
];

function customerValues(companyId: string, p: PessoaInsert): unknown[] {
  return [
    companyId, p.tipoPessoa, p.cnpjCpf, p.nomeRazao, p.nomeFantasia, p.ie, p.indicadorIE, p.email, p.telefone,
    false, 1,
    p.logradouro, p.numero, p.complemento, p.bairro, p.codigoMunicipioIbge, p.municipio, p.uf, p.cep,
    'Brasil', '1058', false, true,
  ];
}

async function importCustomers(db: Db, dump: MysqlDump, companyId: string, municipios: Map<string, string>): Promise<void> {
  const s = stat('customers');
  const seen = new Set<string>();
  const batch: BulkRow[] = [];

  const collect = (p: PessoaInsert | null, legacyId: string): void => {
    if (!p) return;
    if (seen.has(p.cnpjCpf)) {
      rejects.push({ source: 'cliente', legacyId, reason: 'documento duplicado no dump', raw: p.nomeRazao });
      return;
    }
    seen.add(p.cnpjCpf);
    batch.push({ key: p.cnpjCpf, values: customerValues(companyId, p) });
  };

  for (const j of objectRows(dump, 'tab_juridico')) {
    s.total++;
    collect(buildPessoa('cliente', String(j['PK_CLIENTEJURIDICO'] ?? '?'), {
      doc: j['CNPJ'], nome: j['NOME'], razao: j['RAZAOSOCIAL'], ie: j['ISNCRICAOESTADUAL'],
      endereco: j['ENDERECO'], numero: j['NUMERO'], complemento: j['COMPLEMENTO'], bairro: j['BAIRRO'],
      cep: j['CEP'], uf: j['UF'], fkMunicipio: j['FK_MUNICIPIO'], email: j['EMAIL'], telefone: j['TELEFONE'],
    }, municipios), String(j['PK_CLIENTEJURIDICO'] ?? '?'));
  }
  for (const f of objectRows(dump, 'tab_fisico')) {
    s.total++;
    collect(buildPessoa('cliente', String(f['PK_CLIENTEFISICO'] ?? '?'), {
      doc: f['CPF'], nome: f['NOME'], razao: f['NOME'], ie: f['INCRICAOESTADUAL'],
      endereco: f['ENDERECO'], numero: f['NUMERO'], complemento: f['COMPLEMENTO'], bairro: f['BAIRRO'],
      cep: f['CEP'], uf: f['UF'], fkMunicipio: f['FK_MUNICIPIO'], email: f['EMAIL'], telefone: f['TELEFONE'],
    }, municipios), String(f['PK_CLIENTEFISICO'] ?? '?'));
  }

  const r = await bulkUpsert(db, {
    table: 'customers', columns: CUSTOMER_COLUMNS, conflict: '(company_id, cnpj_cpf)', keyCol: 'cnpj_cpf',
    update: ['tipo_pessoa', 'nome_razao', 'nome_fantasia', 'ie', 'indicador_ie', 'email', 'telefone',
      'logradouro', 'numero', 'complemento', 'bairro', 'codigo_municipio_ibge', 'municipio', 'uf', 'cep'],
    rows: batch,
  });
  s.inserted = r.inserted;
  s.updated = r.updated;
  for (const f of r.failures) rejects.push({ source: 'cliente', legacyId: f.key, reason: f.error, raw: '' });
  s.rejected = rejects.filter((x) => x.source === 'cliente').length;
  s.warned = warnings.filter((x) => x.source === 'cliente').length;
}

const SUPPLIER_COLUMNS = [
  'company_id', 'tipo_pessoa', 'cnpj_cpf', 'nome_razao', 'nome_fantasia', 'ie', 'indicador_ie', 'crt_fornecedor',
  'produtor_rural', 'email', 'telefone',
  'logradouro', 'numero', 'complemento', 'bairro', 'codigo_municipio_ibge', 'municipio', 'uf', 'cep', 'active',
];

async function importSuppliers(db: Db, dump: MysqlDump, companyId: string, municipios: Map<string, string>): Promise<void> {
  const s = stat('suppliers');
  const seen = new Set<string>();
  const batch: BulkRow[] = [];

  for (const f of objectRows(dump, 'tab_fornecedor')) {
    s.total++;
    const legacyId = String(f['PK_CODFORNECEDOR'] ?? '?');
    const p = buildPessoa('fornecedor', legacyId, {
      doc: f['CNPJ'] ?? f['CPF'], nome: f['NOMEFANTASIA'], razao: f['RAZAOSOCIAL'],
      ie: f['INSCRICAOESTADUAL'] ?? f['INCRICAOESTADUAL'], endereco: f['ENDERECO'], numero: f['NUMERO'],
      complemento: f['COMPLEMENTO'], bairro: f['BAIRRO'], cep: f['CEP'], uf: f['UF'],
      fkMunicipio: f['FK_MUNICIPIO'], email: f['EMAIL'], telefone: f['TELEFONE'], crt: f['CRT'],
    }, municipios);
    if (!p) continue;
    if (seen.has(p.cnpjCpf)) {
      rejects.push({ source: 'fornecedor', legacyId, reason: 'documento duplicado no dump', raw: p.nomeRazao });
      continue;
    }
    seen.add(p.cnpjCpf);
    batch.push({
      key: p.cnpjCpf,
      values: [
        companyId, p.tipoPessoa, p.cnpjCpf, p.nomeRazao, p.nomeFantasia, p.ie, p.indicadorIE, p.crt,
        false, p.email, p.telefone,
        p.logradouro, p.numero, p.complemento, p.bairro, p.codigoMunicipioIbge, p.municipio, p.uf, p.cep, true,
      ],
    });
  }

  const r = await bulkUpsert(db, {
    table: 'suppliers', columns: SUPPLIER_COLUMNS, conflict: '(company_id, cnpj_cpf)', keyCol: 'cnpj_cpf',
    update: ['tipo_pessoa', 'nome_razao', 'nome_fantasia', 'ie', 'indicador_ie', 'crt_fornecedor', 'email', 'telefone',
      'logradouro', 'numero', 'complemento', 'bairro', 'codigo_municipio_ibge', 'municipio', 'uf', 'cep'],
    rows: batch,
  });
  s.inserted = r.inserted;
  s.updated = r.updated;
  for (const f of r.failures) rejects.push({ source: 'fornecedor', legacyId: f.key, reason: f.error, raw: '' });
  s.rejected = rejects.filter((x) => x.source === 'fornecedor').length;
  s.warned = warnings.filter((x) => x.source === 'fornecedor').length;
}

/** Mapa codigo do produto (CPROD/LEG-id) -> {id, ncm} para ligar itens de NF-e. */
const productByCodigo = new Map<string, { id: string; ncm: string }>();

const PRODUCT_COLUMNS = [
  'company_id', 'codigo', 'codigo_barras', 'descricao', 'ncm', 'origem',
  'unidade_comercial', 'unidade_tributavel', 'cfop_padrao_saida', 'controla_estoque', 'estoque_atual', 'active',
];
const TAX_RULE_COLUMNS = [
  'product_id', 'cst_icms', 'csosn_icms', 'aliq_icms', 'mod_bc', 'importado',
  'cst_ipi', 'aliq_ipi', 'cst_pis', 'aliq_pis', 'cst_cofins', 'aliq_cofins',
  'pis_cofins_por_unidade', 'ipi_por_unidade', 'incidencia_is', 'valid_from', 'valid_to',
];

async function importProducts(db: Db, dump: MysqlDump, companyId: string, crt: string): Promise<void> {
  const s = stat('products');
  const validFrom = '2020-01-01T00:00:00Z';
  const isSimples = crt === 'SIMPLES_NACIONAL' || crt === 'MEI';
  const seen = new Set<string>();

  const prodRows: BulkRow[] = [];
  const ncmByCodigo = new Map<string, string>();
  // Regra tributária por código (sem o product_id, resolvido após o upsert).
  const taxByCodigo = new Map<string, unknown[]>();

  for (const p of objectRows(dump, 'tab_produto')) {
    s.total++;
    const pk = String(p['PK_CODPRODUTO'] ?? '?');
    const descricao = truncate(cleanText(p['DESCRICAO']), 300);
    if (!descricao) {
      rejects.push({ source: 'produto', legacyId: pk, reason: 'descrição vazia', raw: '' });
      continue;
    }
    const cprod = cleanText(p['CPROD']);
    const codigo = truncate(cprod && /\S/.test(cprod) ? cprod : `LEG-${pk}`, 60)!;
    if (seen.has(codigo)) {
      rejects.push({ source: 'produto', legacyId: pk, reason: `código duplicado no dump (${codigo})`, raw: descricao });
      continue;
    }
    seen.add(codigo);

    let ncm = ncm8(p['NCM']);
    if (!ncm) {
      ncm = '00000000';
      warnings.push({ source: 'produto', legacyId: pk, reason: `NCM ausente/inválido (${p['NCM']}) — preenchido 00000000`, raw: descricao });
    }

    const unidade = truncate((cleanText(p['UNIDADE']) ?? cleanText(p['UNIDADE_TRI']) ?? 'UN').toUpperCase(), 6, 'UN')!;
    const barras = digits(p['CODBARRA_COMER']);
    const codigoBarras = barras && barras.length >= 8 && barras.length <= 14 ? barras : null;
    const cfopSaidaRaw = digits(p['CFOPSAIDA']) ?? digits(p['CFOP']);
    const cfopSaida = cfopSaidaRaw && cfopSaidaRaw.length === 4 ? cfopSaidaRaw : null;
    const estoque = numStr(p['QUANTIDADE'], '0');

    prodRows.push({
      key: codigo,
      values: [companyId, codigo, codigoBarras, descricao, ncm, 0, unidade, unidade, cfopSaida, true, estoque, true],
    });
    ncmByCodigo.set(codigo, ncm);

    // Baseline tributário alinhado ao CRT REAL: Simples/MEI -> CSOSN; Normal -> CST + alíquotas do legado.
    const { cst, csosn } = splitIcmsCode(p['CST_ICMS']);
    const { cst: cstPisCof } = splitIcmsCode(p['CST_PISCOFINS']);
    const { cst: cstIpiCode } = splitIcmsCode(p['CST_IPI']);
    taxByCodigo.set(codigo, [
      /* product_id placeholder */ null,
      isSimples ? null : cst ?? '00',
      isSimples ? csosn ?? '102' : null,
      isSimples ? null : numStr(p['Aliquota_ICMS']) ?? numStr(p['ICM']),
      3, false,
      isSimples ? null : cstIpiCode,
      isSimples ? null : numStr(p['Aliquota_IPI']),
      isSimples ? '49' : cstPisCof ?? '01',
      isSimples ? '0' : numStr(p['Aliquota_PIS'], '0'),
      isSimples ? '49' : cstPisCof ?? '01',
      isSimples ? '0' : numStr(p['Aliquota_PISCOFINS'], '0'),
      false, false, false, validFrom, null,
    ]);
  }

  const r = await bulkUpsert(db, {
    table: 'products', columns: PRODUCT_COLUMNS, conflict: '(company_id, codigo)', keyCol: 'codigo',
    update: ['codigo_barras', 'descricao', 'ncm', 'unidade_comercial', 'unidade_tributavel', 'cfop_padrao_saida', 'estoque_atual'],
    rows: prodRows,
  });
  s.inserted = r.inserted;
  s.updated = r.updated;
  for (const f of r.failures) rejects.push({ source: 'produto', legacyId: f.key, reason: f.error, raw: '' });

  // Regras tributárias: idempotente (apaga a regra desse valid_from e reinsere).
  const productIds: string[] = [];
  const taxRows: unknown[][] = [];
  for (const [codigo, info] of r.byKey) {
    productByCodigo.set(codigo, { id: info.id, ncm: ncmByCodigo.get(codigo) ?? '00000000' });
    const tax = taxByCodigo.get(codigo);
    if (tax) {
      productIds.push(info.id);
      taxRows.push([info.id, ...tax.slice(1)]);
    }
  }
  if (productIds.length > 0) {
    await db.query(`DELETE FROM product_tax_rules WHERE product_id = ANY($1::uuid[]) AND valid_from = $2`, [productIds, validFrom]);
    await bulkInsertPlain(db, 'product_tax_rules', TAX_RULE_COLUMNS, taxRows);
  }

  s.rejected = rejects.filter((x) => x.source === 'produto').length;
  s.warned = warnings.filter((x) => x.source === 'produto').length;
}

function toNum(v: DumpValue): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Soma os valores dos itens — usado quando o cabeçalho legado não trouxe os totais. */
function aggregateItems(items: Obj[]): {
  prod: number; desc: number; frete: number; seg: number; outros: number;
  bcIcms: number; icms: number; icmsSt: number; ipi: number; pis: number; cofins: number;
} {
  const a = { prod: 0, desc: 0, frete: 0, seg: 0, outros: 0, bcIcms: 0, icms: 0, icmsSt: 0, ipi: 0, pis: 0, cofins: 0 };
  for (const it of items) {
    a.prod += toNum(it['NITEM_VPROD']);
    a.desc += toNum(it['NITEM_DES']);
    a.frete += toNum(it['NITEM_VFRETE']);
    a.seg += toNum(it['NITEM_VSEG']);
    a.outros += toNum(it['NITEM_VOUTROS']);
    a.bcIcms += toNum(it['ICMS_VBC']);
    a.icms += toNum(it['ICMS_VICMS']);
    a.icmsSt += toNum(it['ICMS_ICMSST']);
    a.ipi += toNum(it['IPI_VIPI']);
    a.pis += toNum(it['PIS_VPIS']);
    a.cofins += toNum(it['COFIN_VPIS']);
  }
  return a;
}

/** Usa o total do cabeçalho quando presente e > 0; senão o valor calculado dos itens. */
function pickTotal(headerVal: DumpValue, computed: number): string {
  const n = headerVal === null || headerVal === undefined || headerVal === '' ? NaN : Number(headerVal);
  return Number.isFinite(n) && n > 0 ? String(n) : computed.toFixed(2);
}

async function importNfes(db: Db, dump: MysqlDump, companyId: string): Promise<void> {
  const s = stat('nfes');
  const sItems = stat('nfe_items');

  // Índice de itens por FK_NFE (PK do cabeçalho legado).
  const itemsByNfe = new Map<string, Obj[]>();
  for (const it of objectRows(dump, 'nfitens')) {
    const fk = String(it['FK_NFE'] ?? '');
    if (!fk) continue;
    (itemsByNfe.get(fk) ?? itemsByNfe.set(fk, []).get(fk)!).push(it);
  }

  // Clientes por documento (para ligar destinatário).
  const custRows = await db.query<{ id: string; cnpj_cpf: string }>(
    `SELECT id, cnpj_cpf FROM customers WHERE company_id = $1`,
    [companyId],
  );
  const customerByDoc = new Map(custRows.rows.map((c) => [c.cnpj_cpf, c.id]));

  for (const h of objectRows(dump, 'notafiscalnfe')) {
    const demi = h['IDE_DEMI'] ? String(h['IDE_DEMI']) : null;
    if (!demi || demi < NFE_DESDE) continue;
    s.total++;
    const pk = String(h['PK_CODNF'] ?? '?');
    const situacao = String(h['SITUACAO'] ?? '');
    if (situacao !== '1' && situacao !== '2') {
      warnings.push({ source: 'nfe', legacyId: pk, reason: `SITUACAO=${situacao} (não autorizada) — ignorada`, raw: demi });
      continue;
    }

    const chave = digits(h['IDE_CHAVENFE']);
    const chaveAcesso = chave && chave.length === 44 ? chave : null;
    // numero/serie do cabeçalho; quando ausentes, extraídos da chave de acesso.
    let numero = digits(h['IDE_NNF']);
    let serie = h['IDE_SERIE'] !== null && h['IDE_SERIE'] !== undefined ? String(h['IDE_SERIE']) : null;
    if (chaveAcesso) {
      if (!serie) serie = String(Number(chaveAcesso.slice(22, 25)));
      if (!numero) numero = String(Number(chaveAcesso.slice(25, 34)));
    }
    if (!numero) {
      rejects.push({ source: 'nfe', legacyId: pk, reason: 'sem número e sem chave de acesso', raw: demi });
      s.rejected++;
      continue;
    }
    const serieNum = serie ? Number(serie) : 1;

    const status = situacao === '2' ? 'CANCELLED' : 'AUTHORIZED';
    const ambiente = String(h['IDE_TPAMB']) === '2' ? 'HOMOLOGACAO' : 'PRODUCAO';
    const tipoOperacao = String(h['IDE_TPNF']) === '0' ? 'ENTRADA' : 'SAIDA';
    const ufDest = (cleanText(h['DES_UF']) ?? '').toUpperCase().slice(0, 2) || null;
    const ufEmi = (cleanText(h['EMI_UF']) ?? CANGUERA.uf).toUpperCase().slice(0, 2);
    const desDoc = digits(h['DES_CNPJ']) ?? digits(h['DES_CPF']);
    const customerId = desDoc ? customerByDoc.get(desDoc) ?? null : null;

    // Totais: o legado não gravou TOTAL_* nas notas recentes — calculamos pelos itens.
    const items = itemsByNfe.get(pk) ?? [];
    const agg = aggregateItems(items);
    const vProd = pickTotal(h['TOTAL_VPROD'], agg.prod);
    const vDesc = pickTotal(h['TOTAL_VDESC'], agg.desc);
    const vFrete = pickTotal(h['TOTAL_VFRETE'], agg.frete);
    const vSeg = pickTotal(h['TOTAL_VSEG'], agg.seg);
    const vOutros = pickTotal(h['TOTAL_VOUTROS'], agg.outros);
    const vIcmsSt = pickTotal(h['TOTAL_VST'], agg.icmsSt);
    const vIpi = pickTotal(h['TOTAL_CIPI'] ?? h['TOTAL_VIPI'], agg.ipi);
    const vNfComputed =
      Number(vProd) - Number(vDesc) + Number(vFrete) + Number(vSeg) + Number(vOutros) + Number(vIcmsSt) + Number(vIpi);
    const vNf = pickTotal(h['TOTAL_VNF'], vNfComputed);

    await db.unit(async () => {
      const r = await db.query<{ id: string; xmax: string }>(
        `INSERT INTO nfes (
           id, company_id, customer_id, numero, serie, modelo, chave_acesso, dh_emissao, dh_sai_ent,
           tipo_operacao, finalidade, natureza_operacao, ambiente, forma_emissao, status, idempotency_key,
           c_stat, x_motivo, protocolo_autorizacao, dh_autorizacao,
           valor_produtos, valor_frete, valor_seguro, valor_desconto, valor_outros, valor_total,
           base_icms, valor_icms, base_icms_st, valor_icms_st, valor_ipi, valor_pis, valor_cofins,
           operacao_interestadual, uf_destino, inf_cpl, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, '55', $5, $6, $7,
           $8, 'NORMAL', $9, $10, 'NORMAL', $11, $12,
           $13, 'Importado do sistema legado (histórico)', $14, $15,
           $16, $17, $18, $19, $20, $21,
           $22, $23, $24, $25, $26, $27, $28,
           $29, $30, $31, now(), now()
         )
         ON CONFLICT (company_id, modelo, serie, numero) DO UPDATE SET
           status = EXCLUDED.status, chave_acesso = EXCLUDED.chave_acesso,
           customer_id = EXCLUDED.customer_id, dh_emissao = EXCLUDED.dh_emissao,
           valor_total = EXCLUDED.valor_total, updated_at = now()
         RETURNING id, xmax::text`,
        [
          companyId, customerId, numero, serieNum, chaveAcesso, demi, h['IDE_DSAIENT'] ? String(h['IDE_DSAIENT']) : null,
          tipoOperacao, truncate(cleanText(h['IDE_NATOP']), 60) ?? 'VENDA', ambiente, status,
          `legacy-canguera-${pk}`,
          status === 'AUTHORIZED' ? '100' : '101', truncate(digits(h['IDE_PROT']), 30),
          status === 'AUTHORIZED' ? demi : null,
          vProd, vFrete, vSeg,
          vDesc, vOutros,
          vNf,
          pickTotal(h['TOTAL_VBC'], agg.bcIcms), pickTotal(h['TOTAL_VICMS'], agg.icms), '0',
          vIcmsSt, vIpi,
          pickTotal(h['TOTAL_VPIS'], agg.pis), pickTotal(h['TOTAL_VCOFINS'], agg.cofins),
          ufDest !== null && ufDest !== ufEmi, ufDest, truncate(cleanText(h['MENSAGEMCOMPL'] ?? h['INF_INFADPROD']), 4000),
        ],
      );
      const nfeId = r.rows[0].id;
      if (r.rows[0].xmax === '0') s.inserted++;
      else s.updated++;

      // Itens: limpa e reinsere (idempotente por nfe_id).
      await db.query(`DELETE FROM nfe_items WHERE nfe_id = $1`, [nfeId]);
      let n = 0;
      for (const it of items) {
        n++;
        sItems.total++;
        const codigoItem = truncate(cleanText(it['NITEM_CPROD']), 60) ?? `ITEM-${n}`;
        const prod = productByCodigo.get(codigoItem);
        const ncmItem = ncm8(it['NITEM_NCM']) ?? prod?.ncm ?? '00000000';
        const cfopItem = (digits(it['NITEM_CFOP']) ?? '').slice(0, 4) || '5102';
        const { cst, csosn } = splitIcmsCode(it['ICMS_CST']);
        await db.query(
          `INSERT INTO nfe_items (
             id, nfe_id, product_id, numero_item, codigo, descricao, ncm, cfop, unidade_comercial,
             quantidade_comercial, valor_unitario, valor_total, valor_desconto,
             cst_icms, csosn_icms, origem_mercadoria, base_icms, aliq_icms, valor_icms,
             cst_ipi, valor_ipi, cst_pis, valor_pis, cst_cofins, valor_cofins, inf_ad_prod,
             created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18,
             $19, $20, $21, $22, $23, $24, $25,
             now(), now()
           )`,
          [
            nfeId, prod?.id ?? null, n, codigoItem,
            truncate(cleanText(it['NITEM_XPROD']), 300) ?? codigoItem, ncmItem, cfopItem,
            truncate((cleanText(it['NITEM_UCOM']) ?? 'UN').toUpperCase(), 6, 'UN'),
            numStr(it['NITEM_QCOM'], '0'), numStr(it['NITEM_VUNCOM'], '0'), numStr(it['NITEM_VPROD'], '0'),
            numStr(it['NITEM_DES'], '0'),
            cst, csosn, it['ICMS_ORI'] !== null && it['ICMS_ORI'] !== undefined ? Number(it['ICMS_ORI']) : null,
            numStr(it['ICMS_VBC'], null), numStr(it['ICMS_ICMS'], null), numStr(it['ICMS_VICMS'], null),
            splitIcmsCode(it['IPI_CST']).cst ?? digits(it['IPI_CST']), numStr(it['IPI_VIPI'], null),
            digits(it['PIS_CST']), numStr(it['PIS_VPIS'], null),
            digits(it['COFINS_CST']), numStr(it['COFIN_VPIS'], null),
            truncate(cleanText(it['INF_INFADPROD']), 4000),
          ],
        );
        sItems.inserted++;
      }
    }).catch((err) => {
      rejects.push({ source: 'nfe', legacyId: pk, reason: dbErr(err), raw: demi });
      s.rejected++;
    });
  }
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function dbErr(err: unknown): string {
  const e = err as { code?: string; message?: string; detail?: string };
  return `DB ${e.code ?? ''} ${e.message ?? String(err)} ${e.detail ?? ''}`.trim().slice(0, 300);
}

async function writeRejectsReport(): Promise<void> {
  const all = [
    ...rejects.map((r) => ({ ...r, level: 'REJECT' })),
    ...warnings.map((r) => ({ ...r, level: 'WARN' })),
  ];
  if (all.length === 0) return;
  await mkdir(dirname(REJECT_PATH), { recursive: true });
  const header = 'level,source,legacy_id,reason,raw\n';
  const body = all
    .map((r) => [r.level, r.source, r.legacyId, csvEscape(r.reason), csvEscape(r.raw)].join(','))
    .join('\n');
  await writeFile(REJECT_PATH, header + body + '\n', 'utf-8');
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function printReport(target: Target): void {
  const line = '─'.repeat(64);
  console.log('\n' + line);
  console.log(`  IMPORT VINHOS CANGUERA — ${DRY_RUN ? 'DRY-RUN (rollback)' : 'COMMIT'}`);
  console.log(line);
  console.log(`  tenant: ${target.tenantId}`);
  console.log(`  company: ${CANGUERA.cnpj} (${target.companyId}) — ${target.created ? 'CRIADA' : 'já existia (reutilizada)'}`);
  console.log(`  CRT da empresa: ${target.crt}  | baseline de impostos: ${target.crt === 'SIMPLES_NACIONAL' || target.crt === 'MEI' ? 'CSOSN' : 'CST'}`);
  console.log(line);
  console.log('  seção           total   inserido  atualizado  rejeitado  alertas');
  for (const [name, st] of Object.entries(stats)) {
    console.log(
      `  ${name.padEnd(14)} ${String(st.total).padStart(6)} ${String(st.inserted).padStart(10)} ` +
        `${String(st.updated).padStart(11)} ${String(st.rejected).padStart(10)} ${String(st.warned).padStart(8)}`,
    );
  }
  console.log(line);
  console.log(`  rejeitados: ${rejects.length} | alertas: ${warnings.length}`);
  if (rejects.length + warnings.length > 0) console.log(`  relatório CSV: ${REJECT_PATH}`);
  console.log(line + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  if (!DB_URL) {
    throw new Error('Defina IMPORT_DATABASE_URL com a connection string do Postgres de destino.');
  }
  console.log(`Lendo dump: ${DUMP_PATH}`);
  const dump = await MysqlDump.fromFile(DUMP_PATH);
  const municipios = buildMunicipioMap(dump);
  console.log(`Municípios no dump: ${municipios.size}`);

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
  const db = new Db(client);

  const tenantsBefore = (await db.query(`SELECT slug, name FROM tenants ORDER BY created_at`)).rows;
  console.log('Tenants existentes no destino:', JSON.stringify(tenantsBefore));

  await client.query('BEGIN');
  let target: Target;
  try {
    target = await resolveTarget(db);
    console.log(`Empresa: ${target.companyId} (${target.created ? 'criada' : 'reutilizada'}), CRT=${target.crt}`);

    await importCustomers(db, dump, target.companyId, municipios);
    await importSuppliers(db, dump, target.companyId, municipios);
    await importProducts(db, dump, target.companyId, target.crt);
    await importNfes(db, dump, target.companyId);

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

  await writeRejectsReport();
  printReport(target);
  await client.end();
}

run().catch((err) => {
  console.error('Falha no import Canguera:', err);
  process.exit(1);
});

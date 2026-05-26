import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { logger } from '@shared/logger';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import { MysqlDump } from './dump-parser';
import {
  classifyDocument,
  normalizeCep,
  readLegacyJuridico,
  readLegacyProduto,
  sanitizeText,
  truncate,
  ufFromCode,
} from './transformers';

/**
 * Import do dump legado `sic_nfe` (MySQL) para o schema novo:
 *  1. Cria/garante o tenant da DCLASS e a Company (CNPJ 16.806.604/0001-60).
 *  2. Importa clientes de `tab_juridico` -> tabela `customers`, distinguindo PF/PJ
 *     pelo tamanho do documento e normalizando UF (código IBGE -> sigla).
 *  3. Importa produtos de `tab_produto` -> tabela `products`, criando uma
 *     `ProductTaxRule` padrão de Simples Nacional (CSOSN 102, sem PIS/COFINS
 *     destacado, sem IPI — apropriado para comércio no SN).
 *
 * Rejeitados (documento ausente, CPF/CNPJ inválido, dados mínimos faltando)
 * vão para um CSV em `/app/tmp/legacy-import-rejeitados.csv` (ou onde o
 * `REJECT_REPORT_PATH` apontar).
 *
 * Idempotente: clientes com mesmo `(company_id, cnpj_cpf)` e produtos com
 * mesmo `(company_id, codigo)` são pulados (ON CONFLICT DO NOTHING).
 *
 * Execução típica:
 *   docker compose exec backend npm run import:legacy
 */

const DUMP_PATH = process.env.LEGACY_DUMP_PATH ?? '/app/docs/Dump20260522.sql';
const REJECT_PATH = process.env.REJECT_REPORT_PATH ?? '/app/tmp/legacy-import-rejeitados.csv';
const CHUNK_SIZE = 500;

const DCLASS = {
  cnpj: '16806604000160',
  razaoSocial: 'CAROLINA ALEO CAPITAO ME',
  nomeFantasia: 'DCLASS AUDIO',
  ie: '432033041112',
  logradouro: 'AV. MITSUKE',
  numero: '744',
  bairro: 'JARDIM CRUZEIRO',
  cep: '18120000',
  uf: 'SP',
  // 3528403 = Mairinque-SP (IBGE 7 dígitos: 3528403)
  codigoMunicipioIbge: '3528403',
  municipio: 'MAIRINQUE',
  telefone: '1147184929',
  email: 'carolinacapitao@dclassaudio.com.br',
} as const;

interface Reject {
  source: 'cliente' | 'produto';
  legacyId: string;
  reason: string;
  raw: string;
}

async function run(): Promise<void> {
  logger.info({ path: DUMP_PATH }, 'Lendo dump legado');
  const dump = await MysqlDump.fromFile(DUMP_PATH);

  await appDataSource.initialize();
  logger.info('Conectado ao Postgres');

  const tenantId = await ensureTenant();
  const companyId = await ensureCompany(tenantId);
  logger.info({ tenantId, companyId }, 'Tenant + Company DCLASS prontos');

  const rejects: Reject[] = [];

  const customersImported = await importCustomers(dump, companyId, rejects);
  const productsImported = await importProducts(dump, companyId, rejects);

  await writeRejectsReport(rejects);

  logger.info(
    {
      customersImported,
      productsImported,
      rejected: rejects.length,
      rejectReport: REJECT_PATH,
    },
    'Import concluído',
  );

  await appDataSource.destroy();
}

/**
 * Reusa o tenant `default` criado pelo seed de bootstrap. Mantém DCLASS no mesmo
 * tenant do admin@sic.local, garantindo que ele veja a empresa após login.
 */
async function ensureTenant(): Promise<string> {
  const slug = 'default';
  const existing = await appDataSource.query<Array<{ id: string }>>(
    `SELECT id FROM tenants WHERE slug = $1`,
    [slug],
  );
  if (existing.length === 0) {
    throw new Error(
      `Tenant '${slug}' não existe. Rode 'npm run seed' antes de importar.`,
    );
  }
  return existing[0].id;
}

async function ensureCompany(tenantId: string): Promise<string> {
  const existing = await appDataSource.query<Array<{ id: string }>>(
    `SELECT id FROM companies WHERE cnpj = $1`,
    [DCLASS.cnpj],
  );
  if (existing.length > 0) return existing[0].id;

  const created = await appDataSource.query<Array<{ id: string }>>(
    `INSERT INTO companies (
       id, tenant_id, cnpj, razao_social, nome_fantasia, ie, crt,
       logradouro, numero, bairro, codigo_municipio_ibge, municipio, uf, cep,
       telefone, email,
       ambiente_sefaz, ambiente_focus_nfe,
       emite_nfe, emite_nfse,
       usa_icms, usa_icms_st, usa_ipi, usa_difal, usa_fcp, usa_icms_desonerado,
       active, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, 'SIMPLES_NACIONAL',
       $6, $7, $8, $9, $10, $11, $12,
       $13, $14,
       'HOMOLOGACAO', 'HOMOLOGACAO',
       true, false,
       true, false, false, false, false, false,
       true, now(), now()
     )
     RETURNING id`,
    [
      tenantId,
      DCLASS.cnpj,
      DCLASS.razaoSocial,
      DCLASS.nomeFantasia,
      DCLASS.ie,
      DCLASS.logradouro,
      DCLASS.numero,
      DCLASS.bairro,
      DCLASS.codigoMunicipioIbge,
      DCLASS.municipio,
      DCLASS.uf,
      DCLASS.cep,
      DCLASS.telefone,
      DCLASS.email,
    ],
  );
  return created[0].id;
}

async function importCustomers(
  dump: MysqlDump,
  companyId: string,
  rejects: Reject[],
): Promise<number> {
  const rows = dump.rows('tab_juridico');
  logger.info({ total: rows.length }, 'Lidos registros tab_juridico');

  const seen = new Set<string>();
  type Insert = {
    tipoPessoa: 'PF' | 'PJ';
    cnpjCpf: string;
    nomeRazao: string;
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
  };
  const batch: Insert[] = [];
  let inserted = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    inserted += await insertCustomerChunk(companyId, batch);
    batch.length = 0;
  };

  for (const row of rows) {
    const j = readLegacyJuridico(row);
    const legacyId = String(j.pkClienteJuridico ?? '?');

    const doc = classifyDocument(j.cnpjCpf);
    if (doc.tipo === null) {
      rejects.push({
        source: 'cliente',
        legacyId,
        reason: doc.reason,
        raw: `${j.nome ?? ''} | doc=${j.cnpjCpf ?? ''}`,
      });
      continue;
    }
    if (seen.has(doc.cnpjCpf)) {
      rejects.push({
        source: 'cliente',
        legacyId,
        reason: 'documento duplicado no dump',
        raw: `${j.nome ?? ''} | doc=${doc.cnpjCpf}`,
      });
      continue;
    }
    seen.add(doc.cnpjCpf);

    const uf = ufFromCode(j.ufCode);
    if (!uf) {
      rejects.push({
        source: 'cliente',
        legacyId,
        reason: `UF inválida ou ausente (código ${j.ufCode})`,
        raw: `${j.nome ?? ''} | doc=${doc.cnpjCpf}`,
      });
      continue;
    }

    const cep = normalizeCep(j.cep);
    if (!cep) {
      rejects.push({
        source: 'cliente',
        legacyId,
        reason: `CEP inválido (${j.cep})`,
        raw: `${j.nome ?? ''} | doc=${doc.cnpjCpf}`,
      });
      continue;
    }

    const nomeRazao = truncate(sanitizeText(j.razaoSocial ?? j.nome), 200);
    if (!nomeRazao) {
      rejects.push({
        source: 'cliente',
        legacyId,
        reason: 'nome/razão social vazio',
        raw: `doc=${doc.cnpjCpf}`,
      });
      continue;
    }

    const logradouro = truncate(sanitizeText(j.endereco), 200) ?? 'NÃO INFORMADO';
    const numero = truncate(j.numero, 20) ?? 'S/N';
    const bairro = truncate(sanitizeText(j.bairro), 100) ?? 'CENTRO';
    const codigoMunicipioIbge = truncate(j.fkMunicipio, 7);
    if (!codigoMunicipioIbge || !/^\d{6,7}$/.test(codigoMunicipioIbge)) {
      rejects.push({
        source: 'cliente',
        legacyId,
        reason: `código de município IBGE inválido (${j.fkMunicipio})`,
        raw: `${nomeRazao} | doc=${doc.cnpjCpf}`,
      });
      continue;
    }
    // O município oficial vai ser preenchido a partir do código IBGE; aqui só guardamos
    // a sigla da UF como rótulo provisório quando o legado não traz o nome do município.
    const municipio = `MUN-${codigoMunicipioIbge}`;

    const ieRaw = (j.ie ?? '').trim().toUpperCase();
    let indicadorIE: 'CONTRIBUINTE' | 'ISENTO' | 'NAO_CONTRIBUINTE';
    let ieFinal: string | null = null;
    if (doc.tipo === 'PF') {
      indicadorIE = 'NAO_CONTRIBUINTE';
    } else if (ieRaw === '' || ieRaw === 'ISENTO' || ieRaw === 'ISENTA') {
      indicadorIE = 'ISENTO';
    } else {
      indicadorIE = 'CONTRIBUINTE';
      ieFinal = truncate(j.ie, 20);
    }

    batch.push({
      tipoPessoa: doc.tipo,
      cnpjCpf: doc.cnpjCpf,
      nomeRazao,
      ie: ieFinal,
      indicadorIE,
      email: truncate(sanitizeText(j.email), 150),
      telefone: truncate(j.telefone, 20),
      logradouro,
      numero,
      complemento: truncate(sanitizeText(j.complemento), 100),
      bairro,
      codigoMunicipioIbge: codigoMunicipioIbge.padStart(7, '0'),
      municipio,
      uf,
      cep,
    });

    if (batch.length >= CHUNK_SIZE) await flush();
  }
  await flush();

  return inserted;
}

async function insertCustomerChunk(
  companyId: string,
  batch: ReadonlyArray<{
    tipoPessoa: 'PF' | 'PJ';
    cnpjCpf: string;
    nomeRazao: string;
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
  }>,
): Promise<number> {
  // Insert posicional em massa: monta VALUES (...),(...),... com placeholders.
  const placeholders: string[] = [];
  const params: unknown[] = [companyId];
  let p = 2;
  for (const c of batch) {
    placeholders.push(
      `(gen_random_uuid(), $1, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ` +
        `$${p++}, true, 1, ` +
        `$${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ` +
        `'Brasil', '1058', false, true, now(), now())`,
    );
    params.push(
      c.tipoPessoa,
      c.cnpjCpf,
      c.nomeRazao,
      c.ie,
      c.indicadorIE,
      c.email,
      c.telefone,
      c.logradouro,
      c.numero,
      c.complemento,
      c.bairro,
      c.codigoMunicipioIbge,
      c.municipio,
      c.uf,
      c.cep,
    );
  }

  // UPSERT: re-rodar o import atualiza nomes/endereços (importante quando o
  // primeiro import gerou mojibake). Não toca em campos comerciais do operador
  // (limite_credito, bloqueado) — esses são preenchidos manualmente.
  const sql =
    `INSERT INTO customers (
       id, company_id, tipo_pessoa, cnpj_cpf, nome_razao, ie, indicador_ie, email, telefone,
       consumidor_final, indicador_presenca,
       logradouro, numero, complemento, bairro, codigo_municipio_ibge, municipio, uf, cep,
       pais, codigo_pais, bloqueado, active, created_at, updated_at
     ) VALUES ${placeholders.join(',')}
     ON CONFLICT (company_id, cnpj_cpf) DO UPDATE SET
       nome_razao = EXCLUDED.nome_razao,
       ie = EXCLUDED.ie,
       indicador_ie = EXCLUDED.indicador_ie,
       email = EXCLUDED.email,
       telefone = EXCLUDED.telefone,
       logradouro = EXCLUDED.logradouro,
       numero = EXCLUDED.numero,
       complemento = EXCLUDED.complemento,
       bairro = EXCLUDED.bairro,
       codigo_municipio_ibge = EXCLUDED.codigo_municipio_ibge,
       municipio = EXCLUDED.municipio,
       uf = EXCLUDED.uf,
       cep = EXCLUDED.cep,
       updated_at = now()`;

  const result = await appDataSource.query<unknown[]>(sql, params);
  // rowCount em queries TypeORM .query() vem como segundo elemento; uso length aprox.
  return Array.isArray(result) ? batch.length : 0;
}

async function importProducts(
  dump: MysqlDump,
  companyId: string,
  rejects: Reject[],
): Promise<number> {
  const rows = dump.rows('tab_produto');
  logger.info({ total: rows.length }, 'Lidos registros tab_produto');

  let inserted = 0;
  const validFrom = new Date('2026-01-01T00:00:00Z');

  for (const row of rows) {
    const p = readLegacyProduto(row);
    const legacyId = String(p.id);

    if (!p.descricao || p.descricao.trim() === '') {
      rejects.push({ source: 'produto', legacyId, reason: 'descrição vazia', raw: '' });
      continue;
    }

    // NCM precisa ter 8 dígitos. O legado armazena como número (ex: 85185000).
    const ncm = (p.ncm ?? 0).toString().padStart(8, '0');
    if (!/^\d{8}$/.test(ncm)) {
      rejects.push({
        source: 'produto',
        legacyId,
        reason: `NCM inválido (${p.ncm})`,
        raw: p.descricao,
      });
      continue;
    }

    // codigo: usa o ID legado prefixado para evitar colisão com cadastros novos
    const codigo = `LEG-${p.id}`;

    // UPSERT: atualiza descrição/NCM em re-runs (caso o primeiro tenha gerado mojibake)
    const upserted = await appDataSource.query<Array<{ id: string; xmax: string }>>(
      `INSERT INTO products (
         id, company_id, codigo, codigo_barras, descricao, ncm, origem,
         unidade_comercial, unidade_tributavel, cfop_padrao_saida,
         controla_estoque, estoque_atual, active, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, 0,
         $6, $6, $7,
         true, '0', true, now(), now()
       )
       ON CONFLICT (company_id, codigo) DO UPDATE SET
         codigo_barras = EXCLUDED.codigo_barras,
         descricao = EXCLUDED.descricao,
         ncm = EXCLUDED.ncm,
         unidade_comercial = EXCLUDED.unidade_comercial,
         unidade_tributavel = EXCLUDED.unidade_tributavel,
         cfop_padrao_saida = EXCLUDED.cfop_padrao_saida,
         updated_at = now()
       RETURNING id, xmax::text`,
      [
        companyId,
        codigo,
        truncate(p.codigoBarras, 14),
        truncate(p.descricao, 300),
        ncm,
        truncate(p.unidade ?? 'UN', 6, 'UN'),
        truncate(p.cfopSaida, 4),
      ],
    );
    const productId = upserted[0].id;
    // xmax = 0 quando foi INSERT; != 0 quando foi UPDATE.
    if (upserted[0].xmax === '0') inserted++;

    // Regra fiscal padrão Simples Nacional (idempotente)
    const ruleExists = await appDataSource.query<Array<{ id: string }>>(
      `SELECT id FROM product_tax_rules WHERE product_id = $1 AND valid_from = $2`,
      [productId, validFrom],
    );
    if (ruleExists.length === 0) {
      await appDataSource.query(
        `INSERT INTO product_tax_rules (
           id, product_id,
           csosn_icms, mod_bc, importado,
           cst_pis, aliq_pis, cst_cofins, aliq_cofins,
           pis_cofins_por_unidade, ipi_por_unidade, incidencia_is,
           valid_from, valid_to, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1,
           '102', 3, false,
           '49', 0, '49', 0,
           false, false, false,
           $2, NULL, now(), now()
         )`,
        [productId, validFrom],
      );
    }
  }

  return inserted;
}

async function writeRejectsReport(rejects: ReadonlyArray<Reject>): Promise<void> {
  if (rejects.length === 0) {
    logger.info('Sem rejeitados — relatório CSV não gerado');
    return;
  }
  await mkdir(dirname(REJECT_PATH), { recursive: true });
  const header = 'source,legacy_id,reason,raw\n';
  const body = rejects
    .map((r) => [r.source, r.legacyId, csvEscape(r.reason), csvEscape(r.raw)].join(','))
    .join('\n');
  await writeFile(REJECT_PATH, header + body + '\n', 'utf-8');
  logger.warn({ path: REJECT_PATH, count: rejects.length }, 'Relatório de rejeitados gravado');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

run().catch((err) => {
  logger.fatal({ err }, 'Falha no import legado');
  process.exit(1);
});

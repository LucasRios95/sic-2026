import { v7 as uuidv7 } from 'uuid';

import { logger } from '@shared/logger';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import ncmRaw from './data/ncm-vigente.json';

interface NcmRawEntry {
  Codigo: string;
  Descricao: string;
  Data_Inicio: string;
  Data_Fim: string;
  Tipo_Ato_Ini?: string;
  Numero_Ato_Ini?: string;
  Ano_Ato_Ini?: string;
}

interface NcmRawFile {
  Data_Ultima_Atualizacao_NCM: string;
  Ato: string;
  Nomenclaturas: NcmRawEntry[];
}

const BATCH_SIZE = 500;

/**
 * Seed do catálogo NCM. Carrega o arquivo oficial CAMEX (~15k entradas) e insere
 * em batches de 500 com `ON CONFLICT DO UPDATE` (idempotente — re-rodar atualiza
 * descrições/vigências sem duplicar).
 */
export async function seedNcms(): Promise<void> {
  const file = ncmRaw as unknown as NcmRawFile;
  const entries = file.Nomenclaturas;
  logger.info(
    { total: entries.length, ato: file.Ato },
    'Seed NCMs iniciando',
  );

  // Cache em memória pra checar duplicatas no próprio JSON (raras mas possíveis).
  const seen = new Set<string>();
  const prepared = entries
    .map((e) => prepararEntrada(e))
    .filter((e) => {
      if (seen.has(e.codigoSemPontos)) return false;
      seen.add(e.codigoSemPontos);
      return true;
    });

  await appDataSource.transaction(async (manager) => {
    for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
      const slice = prepared.slice(i, i + BATCH_SIZE);
      await insertBatch(manager, slice);
    }
  });

  logger.info({ total: prepared.length }, 'Seed NCMs concluído');
}

interface NcmPrepared {
  codigo: string;
  codigoSemPontos: string;
  descricao: string;
  nivel: number;
  validoParaNfe: boolean;
  dataInicio: string | null;
  dataFim: string | null;
  ato: string | null;
}

function prepararEntrada(raw: NcmRawEntry): NcmPrepared {
  const codigo = raw.Codigo;
  const codigoSemPontos = codigo.replace(/\D/g, '');
  const nivel = codigoSemPontos.length;
  return {
    codigo,
    codigoSemPontos,
    descricao: raw.Descricao.slice(0, 500),
    nivel,
    // Só NCMs com EXATAMENTE 8 dígitos vão no XML da NF-e.
    validoParaNfe: nivel === 8,
    dataInicio: parseDate(raw.Data_Inicio),
    dataFim: parseDate(raw.Data_Fim),
    ato: composeAto(raw),
  };
}

/**
 * "01/04/2022" → "2022-04-01". "31/12/9999" → null (CAMEX usa essa data como "em vigor",
 * o que evita confusão com regras de validade no motor tributário).
 */
function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  if (ano === '9999') return null;
  return `${ano}-${mes}-${dia}`;
}

function composeAto(raw: NcmRawEntry): string | null {
  const tipo = raw.Tipo_Ato_Ini?.trim();
  const numero = raw.Numero_Ato_Ini?.trim();
  const ano = raw.Ano_Ato_Ini?.trim();
  if (!tipo && !numero && !ano) return null;
  return [tipo, numero ? `nº ${numero}` : '', ano ? `/${ano}` : '']
    .join(' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

async function insertBatch(
  manager: { query: (q: string, p?: unknown[]) => Promise<unknown> },
  batch: NcmPrepared[],
): Promise<void> {
  // Multi-row INSERT com placeholders numerados — uma única chamada SQL por batch.
  const values: string[] = [];
  const params: unknown[] = [];
  let n = 0;
  for (const e of batch) {
    values.push(
      `($${++n},$${++n},$${++n},$${++n},$${++n},$${++n},$${++n},$${++n},$${++n},true,now(),now())`,
    );
    params.push(
      uuidv7(),
      e.codigo,
      e.codigoSemPontos,
      e.descricao,
      e.nivel,
      e.validoParaNfe,
      e.dataInicio,
      e.dataFim,
      e.ato,
    );
  }
  await manager.query(
    `INSERT INTO ncms
       (id, codigo, codigo_sem_pontos, descricao, nivel, valido_para_nfe, data_inicio, data_fim, ato, ativo, created_at, updated_at)
     VALUES ${values.join(',')}
     ON CONFLICT (codigo_sem_pontos) DO UPDATE SET
       codigo = EXCLUDED.codigo,
       descricao = EXCLUDED.descricao,
       nivel = EXCLUDED.nivel,
       valido_para_nfe = EXCLUDED.valido_para_nfe,
       data_inicio = EXCLUDED.data_inicio,
       data_fim = EXCLUDED.data_fim,
       ato = EXCLUDED.ato,
       updated_at = now()`,
    params,
  );
}

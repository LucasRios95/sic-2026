import 'reflect-metadata';

import { v7 as uuidv7 } from 'uuid';

import { logger } from '@shared/logger';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  aliqInterestadualNacional,
  ALIQ_INTERESTADUAL_IMPORTADO,
  ALIQ_INTERNA_2026,
  TODAS_UFS,
  Uf,
} from './tax-globals';

/**
 * Seed das tabelas globais fiscais. Idempotente: usa ON CONFLICT por chave natural
 * (par UF/UF/validFrom para interestaduais, UF/validFrom para internas). Pode ser
 * re-executado sem efeitos colaterais.
 *
 * Também popula parâmetros tributários iniciais do modo "ano-teste" (RT 2025.002):
 *  - CBS 0,9% e IBS 0,1% em 2026, com modo ANO_TESTE = true → não geram recolhimento.
 *  - PIS/COFINS extintos em 01/01/2027 (RT 2026.001).
 */
export async function seedTaxGlobals(): Promise<void> {
  // Marco: 01/01/2026 — vigência inicial das alíquotas e parâmetros da Reforma.
  const validFrom2026 = new Date('2026-01-01T00:00:00Z');

  await appDataSource.transaction(async (manager) => {
    logger.info('Seed tax-globals: alíquotas interestaduais (Senado 22/89, 13/2012)');

    // Alíquotas interestaduais por par (UF origem, UF destino).
    for (const origem of TODAS_UFS) {
      for (const destino of TODAS_UFS) {
        if (origem === destino) continue;
        const aliqNacional = aliqInterestadualNacional(origem as Uf, destino as Uf);
        await manager.query(
          `INSERT INTO interstate_aliquots
             (id, uf_origem, uf_destino, aliq_nacional, aliq_importado, valid_from, valid_to, fonte_norma, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, now(), now())
           ON CONFLICT (uf_origem, uf_destino, valid_from) DO NOTHING`,
          [
            uuidv7(),
            origem,
            destino,
            aliqNacional,
            ALIQ_INTERESTADUAL_IMPORTADO,
            validFrom2026,
            'Resolução do Senado 22/89 e 13/2012',
          ],
        );
      }
    }

    logger.info('Seed tax-globals: alíquotas internas + FCP por UF');
    for (const uf of TODAS_UFS) {
      const { aliqInterna, aliqFcp } = ALIQ_INTERNA_2026[uf as Uf];
      await manager.query(
        `INSERT INTO icms_interna_uf
           (id, uf, aliq_interna, aliq_fcp, valid_from, valid_to, fonte_norma, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, now(), now())
         ON CONFLICT (uf, valid_from) DO NOTHING`,
        [uuidv7(), uf, aliqInterna, aliqFcp, validFrom2026, 'Legislação estadual vigente em 2026'],
      );
    }

    logger.info('Seed tax-globals: parâmetros da Reforma (modo ano-teste 2026)');

    // CBS alíquota simbólica em 2026 (RT 2025.002 / NT 007/2026).
    await upsertGlobalParam(
      manager,
      'cbs.aliquota.padrao',
      { aliquota: '0.9000', modo: 'ANO_TESTE' },
      validFrom2026,
      'RT 2025.002 (CBS ano-teste 2026)',
    );

    // IBS alíquota simbólica em 2026.
    await upsertGlobalParam(
      manager,
      'ibs.aliquota.padrao',
      { aliquota: '0.1000', modo: 'ANO_TESTE' },
      validFrom2026,
      'RT 2025.002 (IBS ano-teste 2026)',
    );

    // Vigência plena da CBS — substitui o registro acima a partir de 01/01/2027.
    const validFrom2027 = new Date('2027-01-01T00:00:00Z');
    await upsertGlobalParam(
      manager,
      'cbs.aliquota.padrao',
      { aliquota: '8.8000', modo: 'PLENO' },
      validFrom2027,
      'LC 214/2025 (vigência plena CBS 2027) — valor sujeito a regulamentação',
    );

    // PIS/COFINS extintos em 01/01/2027.
    await upsertGlobalParam(
      manager,
      'pis_cofins.encerramento',
      { dataExtincao: '2027-01-01' },
      validFrom2026,
      'EC 132/2023 + LC 214/2025',
    );
  });

  logger.info('Seed tax-globals concluído');
}

async function upsertGlobalParam(
  manager: { query: (q: string, p?: unknown[]) => Promise<unknown> },
  chave: string,
  valor: Record<string, unknown>,
  validFrom: Date,
  fonteNorma: string,
): Promise<void> {
  await manager.query(
    `INSERT INTO tax_parameters
       (id, company_id, chave, valor, fonte_norma, valid_from, valid_to, created_at, updated_at)
     VALUES ($1, NULL, $2, $3::jsonb, $4, $5, NULL, now(), now())
     ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'), chave, valid_from) DO NOTHING`,
    [uuidv7(), chave, JSON.stringify(valor), fonteNorma, validFrom],
  );
}

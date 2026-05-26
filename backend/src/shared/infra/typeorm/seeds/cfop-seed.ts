import { v7 as uuidv7 } from 'uuid';

import { inferirTipoEEscopo } from '@modules/Cfop/domain/cfop-enums';
import { logger } from '@shared/logger';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import { CFOPS_SEED } from './cfops-data';

/**
 * Seed do catálogo de CFOPs. Idempotente: usa ON CONFLICT DO UPDATE no `codigo` único.
 * Re-rodar atualiza descrições + flags sem precisar de migration.
 */
export async function seedCfops(): Promise<void> {
  await appDataSource.transaction(async (manager) => {
    logger.info({ total: CFOPS_SEED.length }, 'Seed CFOPs iniciando');

    for (const entry of CFOPS_SEED) {
      const { tipo, escopo } = inferirTipoEEscopo(entry.codigo);
      await manager.query(
        `INSERT INTO cfops
           (id, codigo, descricao, tipo_operacao, escopo, grupo, gera_credito_pis_cofins, ativo, observacoes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NULL, now(), now())
         ON CONFLICT (codigo) DO UPDATE SET
           descricao = EXCLUDED.descricao,
           tipo_operacao = EXCLUDED.tipo_operacao,
           escopo = EXCLUDED.escopo,
           grupo = EXCLUDED.grupo,
           gera_credito_pis_cofins = EXCLUDED.gera_credito_pis_cofins,
           updated_at = now()`,
        [
          uuidv7(),
          entry.codigo,
          entry.descricao,
          tipo,
          escopo,
          entry.grupo,
          entry.geraCreditoPisCofins ?? false,
        ],
      );
    }

    logger.info({ total: CFOPS_SEED.length }, 'Seed CFOPs concluído');
  });
}

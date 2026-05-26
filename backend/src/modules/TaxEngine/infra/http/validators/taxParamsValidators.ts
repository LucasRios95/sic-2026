import { z } from 'zod';

export const upsertTaxParameterSchema = z.object({
  chave: z.string().min(1).max(120),
  valor: z.unknown(),
  fonteNorma: z.string().max(200).optional().nullable(),
  validFrom: z.string().datetime({ offset: true }),
  validTo: z.string().datetime({ offset: true }).optional().nullable(),
  scope: z.enum(['global', 'company']).default('global'),
});

export const listTaxParametersQuerySchema = z.object({
  scope: z.enum(['all', 'global', 'company']).optional(),
  chavePrefix: z.string().max(120).optional(),
});

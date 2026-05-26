import { z } from 'zod';

export const listNcmsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  apenasValidosNfe: z.enum(['true', 'false']).optional(),
  nivel: z.coerce.number().int().min(2).max(8).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

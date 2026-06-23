import { z } from 'zod';

export const reportQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  format: z.enum(['json', 'csv']).optional(),
});

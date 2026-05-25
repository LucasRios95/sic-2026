import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().max(80).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

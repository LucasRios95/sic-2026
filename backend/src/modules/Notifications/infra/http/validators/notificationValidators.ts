import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  onlyUnread: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  category: z.string().max(60).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

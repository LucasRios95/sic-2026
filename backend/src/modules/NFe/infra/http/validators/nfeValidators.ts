import { z } from 'zod';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';

export const statusServicoSchema = z.object({
  certificateVaultRef: z.string().min(3).max(200),
  uf: z
    .string()
    .regex(/^[A-Z]{2}$/, 'UF deve ter 2 letras maiúsculas')
    .optional(),
  ambiente: z.nativeEnum(AmbienteSefaz).optional(),
  contingenciaSvc: z.boolean().optional(),
});

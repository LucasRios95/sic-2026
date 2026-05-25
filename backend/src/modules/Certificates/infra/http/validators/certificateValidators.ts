import { z } from 'zod';

export const uploadCertificateSchema = z.object({
  /** Conteúdo do PFX em base64. Limitar tamanho — PFX típico é 3-10KB. */
  pfxBase64: z
    .string()
    .min(100, 'pfxBase64 muito curto — PFX inválido')
    .max(200_000, 'pfxBase64 muito longo — PFX típico tem 3-10 KB'),
  password: z.string().min(1).max(200),
  alias: z.string().min(1).max(100).optional(),
});

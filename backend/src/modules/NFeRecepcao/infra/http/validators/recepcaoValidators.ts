import { z } from 'zod';

import { ReceivedDocumentStatus, TipoManifestacao } from '../../../domain/nfe-recepcao-enums';

export const sincronizarRecebidosSchema = z.object({
  certificateVaultRef: z.string().min(3).max(200),
  maxIterations: z.number().int().positive().max(50).optional(),
});

export const manifestarSchema = z
  .object({
    tipo: z.nativeEnum(TipoManifestacao),
    justificativa: z.string().min(15).max(255).optional(),
    certificateVaultRef: z.string().min(3).max(200),
  })
  .refine(
    (d) => {
      const requer =
        d.tipo === TipoManifestacao.DESCONHECIMENTO_OPERACAO ||
        d.tipo === TipoManifestacao.OPERACAO_NAO_REALIZADA;
      return !requer || (d.justificativa && d.justificativa.trim().length >= 15);
    },
    {
      message: 'Justificativa obrigatória (≥ 15 chars) para DESCONHECIMENTO/OPERACAO_NAO_REALIZADA',
      path: ['justificativa'],
    },
  );

export const listReceivedDocumentsQuerySchema = z.object({
  status: z.nativeEnum(ReceivedDocumentStatus).optional(),
  emitenteCnpj: z.string().regex(/^\d{14}$/).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

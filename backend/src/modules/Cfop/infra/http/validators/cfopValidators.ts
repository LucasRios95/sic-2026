import { z } from 'zod';

import { CfopEscopo, CfopTipoOperacao } from '../../../domain/cfop-enums';

export const listCfopsQuerySchema = z.object({
  search: z.string().max(120).optional(),
  tipoOperacao: z.nativeEnum(CfopTipoOperacao).optional(),
  escopo: z.nativeEnum(CfopEscopo).optional(),
  apenasGeraCredito: z.enum(['true', 'false']).optional(),
  apenasAtivos: z.enum(['true', 'false']).optional(),
});

export const upsertCfopSchema = z.object({
  codigo: z.string().regex(/^[123567]\d{3}$/, 'CFOP deve ter 4 dígitos iniciando com 1/2/3/5/6/7'),
  descricao: z.string().min(3).max(500),
  grupo: z.string().max(200).optional().nullable(),
  geraCreditoPisCofins: z.boolean().optional(),
  ativo: z.boolean().optional(),
  observacoes: z.string().max(2000).optional().nullable(),
});

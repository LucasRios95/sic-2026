import { z } from 'zod';

import {
  CstIbsCbs,
  IndicadorOperacaoNFSe,
  TipoRetencaoIss,
} from '@shared/types/fiscal-enums';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Valor decimal inválido');

export const serviceTaxRuleSchema = z.object({
  cstIss: z.string().max(4).optional().nullable(),
  aliqIss: decimalString.optional().nullable(),
  tipoRetencao: z.nativeEnum(TipoRetencaoIss).optional(),
  cstIbsCbs: z.nativeEnum(CstIbsCbs).optional().nullable(),
  cClassTrib: z.string().max(10).optional().nullable(),
  cIndOp: z.nativeEnum(IndicadorOperacaoNFSe).optional().nullable(),
  cstPis: z.string().max(4).optional().nullable(),
  cstCofins: z.string().max(4).optional().nullable(),
  retemPisCofins: z.boolean().optional(),
  retemCsll: z.boolean().optional(),
  retemInss: z.boolean().optional(),
  retemIr: z.boolean().optional(),
  validFrom: z.string().datetime({ offset: true }),
  validTo: z.string().datetime({ offset: true }).optional().nullable(),
});

export const createServiceSchema = z.object({
  codigo: z.string().min(1).max(60),
  descricao: z.string().min(2).max(300),
  codigoTributacaoNacional: z.string().max(10).optional().nullable(),
  itemListaServico: z.string().regex(/^\d{1,2}\.\d{2}(-\d{2})?$/, 'Formato esperado: "1.05"'),
  codigoTributacaoMunicipal: z.string().max(20).optional().nullable(),
  cnae: z.string().max(7).optional().nullable(),
  initialTaxRule: serviceTaxRuleSchema.optional(),
});

export const updateServiceSchema = createServiceSchema
  .omit({ codigo: true, initialTaxRule: true })
  .partial();

export const listServicesQuerySchema = z.object({
  search: z.string().optional(),
  itemListaServico: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

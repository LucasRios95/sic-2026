import { z } from 'zod';

import { CstIbsCbs } from '@shared/types/fiscal-enums';

// Validação de valores monetários/percentuais como string (TypeORM Decimal => string).
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Valor decimal inválido');

/**
 * Schema base sem vigência — usado pelo endpoint "substituir regra vigente"
 * (validFrom/validTo são gerenciados pelo backend nesse fluxo).
 */
export const replaceCurrentTaxRuleSchema = z.object({
  cstIcms: z.string().max(4).optional().nullable(),
  csosnIcms: z.string().max(4).optional().nullable(),
  aliqIcms: decimalString.optional().nullable(),
  modBC: z.number().int().min(0).max(3).optional().nullable(),
  pRedBC: decimalString.optional().nullable(),
  importado: z.boolean().optional(),

  cstIcmsSt: z.string().max(4).optional().nullable(),
  modBCST: z.number().int().min(0).max(6).optional().nullable(),
  pMVAST: decimalString.optional().nullable(),
  pRedBCST: decimalString.optional().nullable(),
  pICMSST: decimalString.optional().nullable(),
  pICMSEfetivo: decimalString.optional().nullable(),

  motDesICMS: z.number().int().min(0).max(99).optional().nullable(),

  pFCP: decimalString.optional().nullable(),
  pFCPST: decimalString.optional().nullable(),
  pFCPSTRet: decimalString.optional().nullable(),

  cstIpi: z.string().max(4).optional().nullable(),
  cEnq: z.string().max(4).optional().nullable(),
  aliqIpi: decimalString.optional().nullable(),
  ipiPorUnidade: z.boolean().optional(),
  vUnidIpi: decimalString.optional().nullable(),

  cstPis: z.string().max(4).optional().nullable(),
  aliqPis: decimalString.optional().nullable(),
  cstCofins: z.string().max(4).optional().nullable(),
  aliqCofins: decimalString.optional().nullable(),
  pisCofinsPorUnidade: z.boolean().optional(),
  vUnidPis: decimalString.optional().nullable(),
  vUnidCofins: decimalString.optional().nullable(),

  cstIbsCbs: z.nativeEnum(CstIbsCbs).optional().nullable(),
  cClassTrib: z.string().max(10).optional().nullable(),
  aliqIbsProduto: decimalString.optional().nullable(),
  aliqCbsProduto: decimalString.optional().nullable(),
  cstIs: z.string().max(4).optional().nullable(),
  aliqIs: decimalString.optional().nullable(),
  incidenciaIs: z.boolean().optional(),
});

export const productTaxRuleSchema = z.object({
  cstIcms: z.string().max(4).optional().nullable(),
  csosnIcms: z.string().max(4).optional().nullable(),
  aliqIcms: decimalString.optional().nullable(),
  modBC: z.number().int().min(0).max(3).optional().nullable(),
  pRedBC: decimalString.optional().nullable(),
  importado: z.boolean().optional(),

  cstIcmsSt: z.string().max(4).optional().nullable(),
  modBCST: z.number().int().min(0).max(6).optional().nullable(),
  pMVAST: decimalString.optional().nullable(),
  pRedBCST: decimalString.optional().nullable(),
  pICMSST: decimalString.optional().nullable(),
  pICMSEfetivo: decimalString.optional().nullable(),

  motDesICMS: z.number().int().min(0).max(99).optional().nullable(),

  pFCP: decimalString.optional().nullable(),
  pFCPST: decimalString.optional().nullable(),
  pFCPSTRet: decimalString.optional().nullable(),

  cstIpi: z.string().max(4).optional().nullable(),
  cEnq: z.string().max(4).optional().nullable(),
  aliqIpi: decimalString.optional().nullable(),
  ipiPorUnidade: z.boolean().optional(),
  vUnidIpi: decimalString.optional().nullable(),

  cstPis: z.string().max(4).optional().nullable(),
  aliqPis: decimalString.optional().nullable(),
  cstCofins: z.string().max(4).optional().nullable(),
  aliqCofins: decimalString.optional().nullable(),
  pisCofinsPorUnidade: z.boolean().optional(),
  vUnidPis: decimalString.optional().nullable(),
  vUnidCofins: decimalString.optional().nullable(),

  cstIbsCbs: z.nativeEnum(CstIbsCbs).optional().nullable(),
  cClassTrib: z.string().max(10).optional().nullable(),
  aliqIbsProduto: decimalString.optional().nullable(),
  aliqCbsProduto: decimalString.optional().nullable(),
  cstIs: z.string().max(4).optional().nullable(),
  aliqIs: decimalString.optional().nullable(),
  incidenciaIs: z.boolean().optional(),

  validFrom: z.string().datetime({ offset: true }),
  validTo: z.string().datetime({ offset: true }).optional().nullable(),
});

const cfopCode = z
  .string()
  .regex(/^[123567]\d{3}$/, 'CFOP deve ter 4 dígitos iniciando com 1/2/3/5/6/7');

export const createProductSchema = z.object({
  codigo: z.string().min(1).max(60),
  codigoBarras: z
    .string()
    .regex(/^\d{8,14}$/, 'GTIN/EAN deve ter entre 8 e 14 dígitos')
    .optional()
    .nullable(),
  descricao: z.string().min(2).max(300),
  ncm: z.string().regex(/^\d{8}$/, 'NCM deve ter 8 dígitos'),
  cest: z.string().regex(/^\d{7}$/).optional().nullable(),
  origem: z.number().int().min(0).max(8),
  unidadeComercial: z.string().min(1).max(6),
  unidadeTributavel: z.string().min(1).max(6),
  cfopPadraoSaida: cfopCode.optional().nullable(),
  cfopPadraoEntrada: cfopCode.optional().nullable(),
  pesoLiquido: decimalString.optional().nullable(),
  pesoBruto: decimalString.optional().nullable(),
  controlaEstoque: z.boolean().optional(),
  initialTaxRule: productTaxRuleSchema.optional(),
});

export const updateProductSchema = createProductSchema
  .omit({ codigo: true, initialTaxRule: true })
  .partial();

export const listProductsQuerySchema = z.object({
  search: z.string().optional(),
  ncm: z.string().regex(/^\d{8}$/).optional(),
  active: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

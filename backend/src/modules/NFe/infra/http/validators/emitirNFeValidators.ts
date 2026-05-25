import { z } from 'zod';

import { FinalidadeNFe, TipoOperacao } from '../../../domain/nfe-enums';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Valor decimal inválido');

export const emitirNFeSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  customerId: z.string().uuid(),
  serie: z.number().int().positive().max(999),
  naturezaOperacao: z.string().min(2).max(60),
  dhEmissao: z.string().datetime({ offset: true }).optional(),
  dhSaiEnt: z.string().datetime({ offset: true }).optional(),
  tipoOperacao: z.nativeEnum(TipoOperacao).optional(),
  finalidade: z.nativeEnum(FinalidadeNFe).optional(),
  modalidadeFrete: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(9)])
    .optional(),
  itens: z
    .array(
      z.object({
        numeroItem: z.number().int().positive(),
        productId: z.string().uuid(),
        descricao: z.string().max(300).optional(),
        cfop: z.string().regex(/^\d{4}$/),
        unidadeComercial: z.string().min(1).max(6),
        quantidade: decimalString,
        valorUnitario: decimalString,
        valorDesconto: decimalString.optional(),
        valorFrete: decimalString.optional(),
        valorSeguro: decimalString.optional(),
        valorOutros: decimalString.optional(),
      }),
    )
    .min(1),
  pagamentos: z
    .array(
      z.object({
        meio: z.string().regex(/^\d{2}$/, 'meio deve ter 2 dígitos (tabela tPag)'),
        valor: decimalString,
        bandeira: z.string().max(10).optional(),
      }),
    )
    .min(1),
  infCpl: z.string().max(5000).optional(),
  infAdFisco: z.string().max(2000).optional(),
  certificateVaultRef: z.string().min(3).max(200).optional(),
  transmitirImediatamente: z.boolean().optional(),
});

export const cancelarNFeSchema = z.object({
  justificativa: z
    .string()
    .min(15, 'Justificativa exige no mínimo 15 caracteres (regra SEFAZ)')
    .max(255),
  certificateVaultRef: z.string().min(3).max(200),
});

export const listNFesQuerySchema = z.object({
  status: z.string().optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

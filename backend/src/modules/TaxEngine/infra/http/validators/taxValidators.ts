import { z } from 'zod';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { IndicadorIE } from '@shared/types/fiscal-enums';

const ufRegex = /^[A-Z]{2}$/;
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Valor decimal inválido');

export const simulateTaxSchema = z.object({
  dataOperacao: z.string().datetime({ offset: true }).optional(),
  destinatario: z.object({
    uf: z.string().regex(ufRegex),
    consumidorFinal: z.boolean(),
    indicadorIE: z.nativeEnum(IndicadorIE),
    crt: z.nativeEnum(CodigoRegimeTributario).optional().nullable(),
    suframa: z.string().max(20).optional().nullable(),
    codigoPais: z.string().length(4).optional(),
  }),
  itens: z
    .array(
      z.object({
        itemId: z.string().min(1).max(80),
        productId: z.string().uuid(),
        quantidade: decimalString,
        valorUnitario: decimalString,
        valorDesconto: decimalString.optional(),
        valorFrete: decimalString.optional(),
        valorSeguro: decimalString.optional(),
        valorOutros: decimalString.optional(),
        cfop: z.string().regex(/^\d{4}$/, 'CFOP deve ter 4 dígitos'),
      }),
    )
    .min(1, 'Informe pelo menos um item'),
});

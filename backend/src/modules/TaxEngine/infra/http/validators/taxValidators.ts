import { z } from 'zod';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { IndicadorIE } from '@shared/types/fiscal-enums';

const ufRegex = /^[A-Z]{2}$/;
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Valor decimal inválido');

/** Base/alíquota digitada na conferência de impostos: decimal com ponto, não negativo. */
const valorAjuste = z.string().regex(/^\d+(\.\d+)?$/, 'Valor decimal não negativo inválido');
const aliquotaAjuste = valorAjuste.refine((v) => Number(v) <= 100, 'Alíquota acima de 100%');
const baseAliquota = z.object({ base: valorAjuste.optional(), aliquota: aliquotaAjuste.optional() });

/**
 * Ajustes manuais de tributos por item (modal "Impostos" da emissão). Mesmo shape de
 * `AjustesTributariosItem` do motor — reaproveitado pelos validators de emissão e prévia.
 */
export const ajustesTributariosSchema = z.object({
  icms: baseAliquota.extend({ pDif: aliquotaAjuste.optional() }).optional(),
  // MVA pode passar de 100% (ex.: bebidas), por isso sem o teto da alíquota.
  icmsSt: baseAliquota.extend({ mva: valorAjuste.optional() }).optional(),
  ipi: baseAliquota.optional(),
  pis: baseAliquota.optional(),
  cofins: baseAliquota.optional(),
  difal: z
    .object({
      base: valorAjuste.optional(),
      aliquotaDestino: aliquotaAjuste.optional(),
      aliquotaInterestadual: aliquotaAjuste.optional(),
    })
    .optional(),
  fcpDestino: z.object({ aliquota: aliquotaAjuste.optional() }).optional(),
  ibsCbs: z
    .object({
      base: valorAjuste.optional(),
      aliquotaIbs: aliquotaAjuste.optional(),
      aliquotaCbs: aliquotaAjuste.optional(),
    })
    .optional(),
  creditoSn: baseAliquota.optional(),
});

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
        // Mesmo override de CST/CSOSN da emissão — sem ele a prévia calculava com o código
        // do cadastro enquanto a nota saía com o código alterado na tela.
        cstIcms: z.string().regex(/^\d{2}$/, 'CST de ICMS tem 2 dígitos').optional(),
        csosnIcms: z.string().regex(/^\d{3}$/, 'CSOSN tem 3 dígitos').optional(),
        ajustes: ajustesTributariosSchema.optional(),
      }),
    )
    .min(1, 'Informe pelo menos um item'),
});

import { z } from 'zod';

import { FinalidadeNFe, TipoOperacao } from '../../../domain/nfe-enums';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Valor decimal inválido');

/**
 * Grupo NFref no payload externo. Por enquanto expomos só `refNFe` (chave 44 dígitos)
 * via shape simples — cobre ~99% das devoluções. Outros tipos (refNF, refCTe, refNFP)
 * já existem no domain mas ficam fora do contrato externo até demanda real.
 */
const referenciaNFeSchema = z.object({
  chaveAcesso: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{44}$/, 'Chave de acesso deve ter 44 dígitos')),
});

export const emitirNFeSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  customerId: z.string().uuid(),
  serie: z.number().int().positive().max(999),
  /**
   * Número da NF-e (opcional). BigInt como string para acomodar séries com
   * histórico > 2^32. Quando omitido, o backend aloca automaticamente.
   */
  numero: z
    .string()
    .regex(/^[1-9]\d*$/, 'Número deve ser inteiro positivo (sem zeros à esquerda)')
    .max(9, 'Número não pode ter mais de 9 dígitos (limite SEFAZ)')
    .optional(),
  naturezaOperacao: z.string().min(2).max(60),
  dhEmissao: z.string().datetime({ offset: true }).optional(),
  dhSaiEnt: z.string().datetime({ offset: true }).optional(),
  tipoOperacao: z.nativeEnum(TipoOperacao).optional(),
  finalidade: z.nativeEnum(FinalidadeNFe).optional(),
  /** NF-e referenciadas (grupo NFref). Obrigatório para devolução/complementar/ajuste. */
  nfeReferenciadas: z.array(referenciaNFeSchema).max(10).optional(),
  modalidadeFrete: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(9)])
    .optional(),
  /** Bloco de transporte estendido: transportadora + veículo + volumes. */
  transporte: z
    .object({
      transportadora: z
        .object({
          cnpjCpf: z.string().optional().nullable(),
          nome: z.string().max(200).optional().nullable(),
          ie: z.string().max(20).optional().nullable(),
          endereco: z.string().max(200).optional().nullable(),
          municipio: z.string().max(100).optional().nullable(),
          uf: z.string().length(2).optional().nullable(),
        })
        .optional(),
      veiculo: z
        .object({
          placa: z.string().min(7).max(8),
          uf: z.string().length(2),
          rntc: z.string().max(20).optional().nullable(),
        })
        .optional(),
      volumes: z
        .array(
          z.object({
            quantidade: z.number().int().positive().optional(),
            especie: z.string().max(60).optional().nullable(),
            marca: z.string().max(60).optional().nullable(),
            numeracao: z.string().max(60).optional().nullable(),
            pesoLiquido: decimalString.optional().nullable(),
            pesoBruto: decimalString.optional().nullable(),
          }),
        )
        .max(20)
        .optional(),
    })
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

export const emitirEpecSchema = z.object({
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

import { z } from 'zod';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import {
  IndicadorIE,
  IndicadorPresenca,
  TipoPessoa,
} from '@shared/types/fiscal-enums';

const ufRegex = /^[A-Z]{2}$/;
const cepRegex = /^\d{8}$/;
const ibgeRegex = /^\d{7}$/;

const baseAddressFields = {
  logradouro: z.string().min(1).max(200),
  numero: z.string().min(1).max(20),
  complemento: z.string().max(100).optional().nullable(),
  bairro: z.string().min(1).max(100),
  codigoMunicipioIbge: z.string().regex(ibgeRegex, 'Código IBGE deve ter 7 dígitos'),
  municipio: z.string().min(1).max(100),
  uf: z.string().regex(ufRegex, 'UF deve ter 2 letras maiúsculas'),
  cep: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(cepRegex, 'CEP deve ter 8 dígitos')),
};

export const createCustomerSchema = z.object({
  tipoPessoa: z.nativeEnum(TipoPessoa),
  cnpjCpf: z.string().min(1).max(20),
  nomeRazao: z.string().min(2).max(200),
  nomeFantasia: z.string().max(200).optional().nullable(),
  ie: z.string().max(20).optional().nullable(),
  indicadorIE: z.nativeEnum(IndicadorIE),
  im: z.string().max(20).optional().nullable(),
  suframa: z.string().max(20).optional().nullable(),
  email: z.string().email().max(150).optional().nullable(),
  telefone: z.string().max(20).optional().nullable(),
  crtDestinatario: z.nativeEnum(CodigoRegimeTributario).optional().nullable(),
  consumidorFinal: z.boolean().optional(),
  indicadorPresenca: z.nativeEnum(IndicadorPresenca).optional().nullable(),
  ...baseAddressFields,
  pais: z.string().max(60).optional(),
  codigoPais: z.string().length(4).optional(),
  limiteCredito: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  bloqueado: z.boolean().optional(),
});

export const updateCustomerSchema = createCustomerSchema
  .omit({ tipoPessoa: true, cnpjCpf: true })
  .partial();

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

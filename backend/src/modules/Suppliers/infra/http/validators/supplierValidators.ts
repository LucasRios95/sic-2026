import { z } from 'zod';

import { CodigoRegimeTributario } from '@modules/Companies/infra/typeorm/entities/Company';
import { IndicadorIE, TipoPessoa } from '@shared/types/fiscal-enums';

const ufRegex = /^[A-Z]{2}$/;
const cepRegex = /^\d{8}$/;
const ibgeRegex = /^\d{7}$/;

export const createSupplierSchema = z.object({
  tipoPessoa: z.nativeEnum(TipoPessoa),
  cnpjCpf: z.string().min(1).max(20),
  nomeRazao: z.string().min(2).max(200),
  nomeFantasia: z.string().max(200).optional().nullable(),
  ie: z.string().max(20).optional().nullable(),
  indicadorIE: z.nativeEnum(IndicadorIE),
  crtFornecedor: z.nativeEnum(CodigoRegimeTributario).optional().nullable(),
  produtorRural: z.boolean().optional(),
  email: z.string().email().max(150).optional().nullable(),
  telefone: z.string().max(20).optional().nullable(),
  logradouro: z.string().min(1).max(200),
  numero: z.string().min(1).max(20),
  complemento: z.string().max(100).optional().nullable(),
  bairro: z.string().min(1).max(100),
  codigoMunicipioIbge: z.string().regex(ibgeRegex),
  municipio: z.string().min(1).max(100),
  uf: z.string().regex(ufRegex),
  cep: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(cepRegex)),
});

export const updateSupplierSchema = createSupplierSchema
  .omit({ tipoPessoa: true, cnpjCpf: true })
  .partial();

export const listSuppliersQuerySchema = z.object({
  search: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

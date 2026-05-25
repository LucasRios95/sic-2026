import { z } from 'zod';

import {
  AmbienteSefaz,
  CodigoRegimeTributario,
} from '@modules/Companies/infra/typeorm/entities/Company';

const ufRegex = /^[A-Z]{2}$/;
const cepRegex = /^\d{8}$/;
const cnpjRegex = /^\d{14}$/;
const ibgeRegex = /^\d{7}$/;
const ncmRegex = /^\d{8}$/; // reservado para uso futuro
void ncmRegex;

export const createCompanySchema = z.object({
  cnpj: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(cnpjRegex, 'CNPJ deve ter 14 dígitos')),
  razaoSocial: z.string().min(3).max(200),
  nomeFantasia: z.string().max(200).optional().nullable(),
  ie: z.string().max(20).optional().nullable(),
  im: z.string().max(20).optional().nullable(),
  crt: z.nativeEnum(CodigoRegimeTributario),
  cnae: z.string().max(7).optional().nullable(),

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
  telefone: z.string().max(20).optional().nullable(),
  email: z.string().email().max(150).optional().nullable(),

  ambienteSefaz: z.nativeEnum(AmbienteSefaz).optional(),
  ambienteFocusNfe: z.nativeEnum(AmbienteSefaz).optional(),
  emiteNfe: z.boolean().optional(),
  emiteNfse: z.boolean().optional(),

  usaIcms: z.boolean().optional(),
  usaIcmsSt: z.boolean().optional(),
  usaIpi: z.boolean().optional(),
  usaDifal: z.boolean().optional(),
  usaFcp: z.boolean().optional(),
  usaIcmsDesonerado: z.boolean().optional(),
});

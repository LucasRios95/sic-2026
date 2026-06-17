import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('E-mail inválido'),
  fullName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(200),
  password: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(128, 'Senha excessivamente longa')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter ao menos uma letra minúscula')
    .regex(/\d/, 'Senha deve conter ao menos um número'),
});

/** Edição de usuário. Todos os campos opcionais; senha (quando enviada) re-hasheada. */
export const updateUserSchema = z
  .object({
    fullName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(200).optional(),
    active: z.boolean().optional(),
    password: z
      .string()
      .min(8, 'Senha deve ter pelo menos 8 caracteres')
      .max(128, 'Senha excessivamente longa')
      .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
      .regex(/[a-z]/, 'Senha deve conter ao menos uma letra minúscula')
      .regex(/\d/, 'Senha deve conter ao menos um número')
      .optional(),
  })
  .refine((d) => d.fullName !== undefined || d.active !== undefined || d.password !== undefined, {
    message: 'Informe ao menos um campo para atualizar',
  });

/** Atribuição/revogação de papel ao usuário. companyId ausente = papel global do tenant. */
export const userRoleSchema = z.object({
  roleId: z.string().uuid('roleId inválido'),
  companyId: z.string().uuid('companyId inválido').nullish(),
});

import { z } from 'zod';

export const authenticateUserSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken é obrigatório'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken é obrigatório'),
});

/** Troca de senha do próprio usuário (self-service). Nova senha com a mesma regra do cadastro. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, 'Senha atual inválida'),
  newPassword: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(128, 'Senha excessivamente longa')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter ao menos uma letra minúscula')
    .regex(/\d/, 'Senha deve conter ao menos um número'),
});

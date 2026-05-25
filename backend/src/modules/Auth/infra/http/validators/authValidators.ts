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

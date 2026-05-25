import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { env } from '@config/env';
import { getRequestId } from '@shared/context/request-context';
import { AppError, ValidationError } from '@shared/errors';
import { logger } from '@shared/logger';

/**
 * Middleware global de erros. Captura toda exceção propagada pelos controllers
 * (Express 5 já trata async errors nativamente) e produz o envelope padronizado:
 *   { error: { code, message, details? }, requestId }
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = getRequestId();

  if (err instanceof ZodError) {
    err = new ValidationError('Falha de validação', err.flatten());
  }

  if (err instanceof AppError) {
    logger.warn({ err: { code: err.code, message: err.message }, path: req.path }, 'AppError');
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
      requestId,
    });
    return;
  }

  // Erro inesperado: nunca devolver stack em produção.
  logger.error({ err, path: req.path, method: req.method }, 'UnhandledError');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
      ...(env.NODE_ENV === 'development' ? { details: { stack: err.stack, name: err.name } } : {}),
    },
    requestId,
  });
}

import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

import { ValidationError } from '@shared/errors';

interface Schemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Middleware Zod por parte da requisição. Erros são convertidos em ValidationError 422
 * com `details` estruturado (campo → mensagem), para que o frontend possa destacar
 * exatamente onde corrigir.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // Express 5: req.query é getter somente-leitura. Atribuímos os valores validados
        // a uma propriedade auxiliar para evitar reatribuição.
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, 'validatedQuery', { value: parsed, writable: false });
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.defineProperty(req, 'validatedParams', { value: parsed, writable: false });
      }
      next();
    } catch (err) {
      if (err && typeof err === 'object' && 'issues' in err) {
        next(new ValidationError('Dados inválidos', (err as { flatten: () => unknown }).flatten()));
        return;
      }
      next(err);
    }
  };
}

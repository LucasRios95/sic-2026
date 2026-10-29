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
  // Fail-fast no wiring das rotas: `validate({ body: algoQueNãoExiste })` — um import
  // quebrado, um schema renomeado — passaria batido, porque o `if (schemas.body)` abaixo
  // é falsy e a rota simplesmente rodaria SEM validação. Como o backend roda via tsx (sem
  // type-check), o tsc não barra isso no deploy. Melhor derrubar o boot do que servir uma
  // rota fiscal aceitando qualquer payload.
  for (const parte of ['body', 'query', 'params'] as const) {
    if (parte in schemas && !schemas[parte]) {
      throw new Error(
        `validate(): schema de "${parte}" está undefined — import quebrado ou schema inexistente.`,
      );
    }
  }

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
        const zodErr = err as {
          flatten: () => object;
          issues: Array<{ path: Array<string | number>; message: string }>;
        };
        // `flatten()` colapsa arrays: um item inválido dentro de `itens` vira só
        // { itens: ["..."] }, sem dizer QUAL item. Mandamos junto o caminho completo
        // ("itens.6.valorUnitario") para o front conseguir apontar a linha exata.
        next(
          new ValidationError('Dados inválidos', {
            ...zodErr.flatten(),
            issues: zodErr.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          }),
        );
        return;
      }
      next(err);
    }
  };
}

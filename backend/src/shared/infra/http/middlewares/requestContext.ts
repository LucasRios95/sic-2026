import { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';

import { runWithRequestContext } from '@shared/context/request-context';

/**
 * Atribui um requestId UUID v7 a cada requisição e o propaga via AsyncLocalStorage,
 * para que qualquer camada (use case, repositório) possa logar com correlação
 * sem precisar receber o id como parâmetro.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inboundId = req.header('x-request-id');
  const requestId = inboundId && inboundId.length <= 64 ? inboundId : uuidv7();
  res.setHeader('x-request-id', requestId);

  runWithRequestContext({ requestId }, () => next());
}

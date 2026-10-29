import { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { validate } from '@shared/infra/http/middlewares/validate';
import { ValidationError } from '@shared/errors';

const schema = z.object({
  itens: z.array(
    z.object({
      valorUnitario: z.string().regex(/^-?\d+(\.\d+)?$/, 'Valor decimal inválido'),
      cfop: z.string().regex(/^\d{4}$/, 'CFOP deve ter 4 dígitos'),
    }),
  ),
});

/** Roda o middleware e devolve o erro passado ao `next`. */
function run(body: unknown): unknown {
  let captured: unknown;
  const next: NextFunction = (err?: unknown) => {
    captured = err;
  };
  validate({ body: schema })({ body } as Request, {} as Response, next);
  return captured;
}

describe('validate middleware', () => {
  it('deixa passar um body válido', () => {
    expect(run({ itens: [{ valorUnitario: '13.50', cfop: '5102' }] })).toBeUndefined();
  });

  it('aponta QUAL item do array falhou (o flatten do zod sozinho perde o índice)', () => {
    const err = run({
      itens: [
        { valorUnitario: '17.00', cfop: '5102' },
        { valorUnitario: '', cfop: '5102' },
      ],
    });

    expect(err).toBeInstanceOf(ValidationError);
    const details = (err as ValidationError).details as {
      fieldErrors: Record<string, string[]>;
      issues: Array<{ path: string; message: string }>;
    };

    // Compatibilidade: o formato antigo (flatten) continua presente...
    expect(details.fieldErrors.itens).toContain('Valor decimal inválido');
    // ...mas agora com o caminho completo, que é o que permite destacar a linha.
    expect(details.issues).toEqual([
      { path: 'itens.1.valorUnitario', message: 'Valor decimal inválido' },
    ]);
  });

  it('recusa no wiring quando o schema é undefined (import quebrado)', () => {
    // Sem esse guard a rota subiria SEM validação nenhuma: o `if (schemas.body)` interno
    // é falsy e o middleware vira um no-op silencioso. Foi assim que /nfe/:id/cce e
    // /nfe/inutilizar ficaram sem validação de body.
    expect(() => validate({ body: undefined })).toThrow(/undefined/);
    expect(() => validate({ query: undefined })).toThrow(/query/);
    // Omitir a chave continua válido — significa "não valido essa parte".
    expect(() => validate({ body: schema })).not.toThrow();
  });

  it('lista todos os campos inválidos, de itens diferentes', () => {
    const err = run({
      itens: [
        { valorUnitario: '13.', cfop: '5102' },
        { valorUnitario: '17.00', cfop: '510' },
      ],
    });

    const { issues } = (err as ValidationError).details as {
      issues: Array<{ path: string; message: string }>;
    };
    expect(issues.map((i) => i.path)).toEqual(['itens.0.valorUnitario', 'itens.1.cfop']);
  });
});

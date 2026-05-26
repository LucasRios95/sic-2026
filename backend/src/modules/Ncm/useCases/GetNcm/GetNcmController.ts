import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { INcmRepository } from '../../repositories/INcmRepository';

export class GetNcmController {
  async handle(request: Request, response: Response): Promise<Response> {
    const repo = container.resolve<INcmRepository>('NcmRepository');
    const codigo = String(request.params.codigo ?? '').replace(/\D/g, '');
    const ncm = await repo.findByCodigo(codigo);
    if (!ncm) throw new NotFoundError(`NCM ${codigo} não encontrado`);
    return response.json({ data: ncm });
  }
}

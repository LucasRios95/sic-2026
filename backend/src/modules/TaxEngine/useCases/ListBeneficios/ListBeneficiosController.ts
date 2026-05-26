import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { IBeneficioFiscalUfRepository } from '../../repositories/IBeneficioFiscalUfRepository';

export class ListBeneficiosController {
  async handle(_request: Request, response: Response): Promise<Response> {
    const repo = container.resolve<IBeneficioFiscalUfRepository>(
      'BeneficioFiscalUfRepository',
    );
    const items = await repo.listAll();
    return response.json({ data: items });
  }
}

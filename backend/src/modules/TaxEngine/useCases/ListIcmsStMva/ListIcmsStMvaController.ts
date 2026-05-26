import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { IIcmsStMvaRepository } from '../../repositories/IIcmsStMvaRepository';

export class ListIcmsStMvaController {
  async handle(_request: Request, response: Response): Promise<Response> {
    const repo = container.resolve<IIcmsStMvaRepository>('IcmsStMvaRepository');
    const items = await repo.listAll();
    return response.json({ data: items });
  }
}

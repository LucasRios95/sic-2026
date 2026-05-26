import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { IInterstateAliquotRepository } from '../../repositories/IInterstateAliquotRepository';

export class ListInterstateAliquotsController {
  async handle(_request: Request, response: Response): Promise<Response> {
    const repo = container.resolve<IInterstateAliquotRepository>(
      'InterstateAliquotRepository',
    );
    const items = await repo.listAll();
    return response.json({ data: items });
  }
}

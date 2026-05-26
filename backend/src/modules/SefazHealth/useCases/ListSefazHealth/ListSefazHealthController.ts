import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListSefazHealthUseCase } from './ListSefazHealthUseCase';

export class ListSefazHealthController {
  async handle(_request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListSefazHealthUseCase);
    const items = await useCase.execute();
    return response.json({ data: items });
  }
}

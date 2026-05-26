import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';

import { ProbeSefazHealthUseCase } from './ProbeSefazHealthUseCase';

export class ProbeSefazHealthController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ProbeSefazHealthUseCase);
    const ambiente = request.body?.ambiente as AmbienteSefaz | undefined;
    const outcomes = await useCase.execute({ ambiente });
    return response.status(202).json({ data: outcomes });
  }
}

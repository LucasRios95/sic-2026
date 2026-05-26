import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { UpdateCompanyUseCase } from './UpdateCompanyUseCase';

export class UpdateCompanyController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(UpdateCompanyUseCase);
    const company = await useCase.execute({
      id: request.params.id,
      data: request.body,
    });
    return response.json({ data: company });
  }
}

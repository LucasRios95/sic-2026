import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { CreateCompanyUseCase } from './CreateCompanyUseCase';

export class CreateCompanyController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(CreateCompanyUseCase);

    // tenantId vem do contexto autenticado, não do body — evita escalada cross-tenant.
    const tenantId = request.user!.tenantId;

    const company = await useCase.execute({ ...request.body, tenantId });
    return response.status(201).json({ data: company });
  }
}

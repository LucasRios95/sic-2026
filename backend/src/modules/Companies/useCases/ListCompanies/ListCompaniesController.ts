import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GLOBAL_COMPANY_ID } from '@modules/AccessControl/infra/typeorm/entities/UserRole';

import { ListCompaniesUseCase } from './ListCompaniesUseCase';

export class ListCompaniesController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListCompaniesUseCase);

    const user = request.user!;
    const isGlobalAccess = user.accessibleCompanyIds.includes(GLOBAL_COMPANY_ID);

    const companies = await useCase.execute({
      tenantId: user.tenantId,
      accessibleCompanyIds: user.accessibleCompanyIds.filter((id) => id !== GLOBAL_COMPANY_ID),
      isGlobalAccess,
    });

    return response.json({ data: companies });
  }
}

import { inject, injectable } from 'tsyringe';

import { Company } from '../../infra/typeorm/entities/Company';
import { ICompanyRepository } from '../../repositories/ICompanyRepository';

interface IRequest {
  tenantId: string;
  accessibleCompanyIds: string[];
  isGlobalAccess: boolean;
}

@injectable()
export class ListCompaniesUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,
  ) {}

  /**
   * Lista somente as empresas que o usuário pode acessar.
   * - Se houver papel global no tenant (companyId = sentinel zerado), retorna todas as
   *   empresas ativas do tenant.
   * - Caso contrário, retorna o subconjunto explícito atribuído via UserRole.
   */
  async execute({ tenantId, accessibleCompanyIds, isGlobalAccess }: IRequest): Promise<Company[]> {
    if (isGlobalAccess) {
      return this.companyRepository.listByTenant(tenantId);
    }
    if (accessibleCompanyIds.length === 0) return [];
    const companies = await this.companyRepository.findByIds(accessibleCompanyIds);
    return companies.filter((c) => c.tenantId === tenantId);
  }
}

import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { Service } from '../../infra/typeorm/entities/Service';
import { ServiceTaxRule } from '../../infra/typeorm/entities/ServiceTaxRule';
import { IServiceRepository } from '../../repositories/IServiceRepository';
import { IServiceTaxRuleRepository } from '../../repositories/IServiceTaxRuleRepository';

interface IResponse {
  service: Service;
  taxRules: ServiceTaxRule[];
}

@injectable()
export class GetServiceUseCase {
  constructor(
    @inject('ServiceRepository')
    private readonly serviceRepository: IServiceRepository,

    @inject('ServiceTaxRuleRepository')
    private readonly taxRuleRepository: IServiceTaxRuleRepository,
  ) {}

  async execute(companyId: string, serviceId: string): Promise<IResponse> {
    const service = await this.serviceRepository.findById(companyId, serviceId);
    if (!service) throw new NotFoundError('Serviço não encontrado');

    const taxRules = await this.taxRuleRepository.listByService(serviceId);
    return { service, taxRules };
  }
}

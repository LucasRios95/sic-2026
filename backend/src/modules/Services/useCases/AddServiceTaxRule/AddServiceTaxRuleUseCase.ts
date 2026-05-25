import { inject, injectable } from 'tsyringe';

import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';
import { hasOverlap } from '@shared/domain/validity-window';

import { IServiceTaxRuleDTO } from '../../dtos/ServiceDTOs';
import { ServiceTaxRule } from '../../infra/typeorm/entities/ServiceTaxRule';
import { IServiceRepository } from '../../repositories/IServiceRepository';
import { IServiceTaxRuleRepository } from '../../repositories/IServiceTaxRuleRepository';

interface IRequest {
  companyId: string;
  serviceId: string;
  data: IServiceTaxRuleDTO;
}

@injectable()
export class AddServiceTaxRuleUseCase {
  constructor(
    @inject('ServiceRepository')
    private readonly serviceRepository: IServiceRepository,

    @inject('ServiceTaxRuleRepository')
    private readonly taxRuleRepository: IServiceTaxRuleRepository,
  ) {}

  async execute({ companyId, serviceId, data }: IRequest): Promise<ServiceTaxRule> {
    const service = await this.serviceRepository.findById(companyId, serviceId);
    if (!service) throw new NotFoundError('Serviço não encontrado');

    const validFrom = new Date(data.validFrom);
    const validTo = data.validTo ? new Date(data.validTo) : null;
    if (validTo && validTo <= validFrom) {
      throw new ValidationError('validTo deve ser posterior a validFrom', { field: 'validTo' });
    }

    const existing = await this.taxRuleRepository.listByService(serviceId);
    if (hasOverlap({ validFrom, validTo }, existing)) {
      throw new BusinessRuleError(
        'A janela de vigência conflita com uma regra existente.',
        'SERVICE_TAX_RULE_OVERLAP',
      );
    }

    return this.taxRuleRepository.create({
      ...data,
      serviceId,
      validFrom,
      validTo,
    });
  }
}

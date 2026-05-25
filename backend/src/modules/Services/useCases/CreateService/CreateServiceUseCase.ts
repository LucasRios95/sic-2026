import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

import { ICreateServiceDTO } from '../../dtos/ServiceDTOs';
import { Service } from '../../infra/typeorm/entities/Service';
import { IServiceRepository } from '../../repositories/IServiceRepository';
import { IServiceTaxRuleRepository } from '../../repositories/IServiceTaxRuleRepository';

@injectable()
export class CreateServiceUseCase {
  constructor(
    @inject('ServiceRepository')
    private readonly serviceRepository: IServiceRepository,

    @inject('ServiceTaxRuleRepository')
    private readonly taxRuleRepository: IServiceTaxRuleRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(data: ICreateServiceDTO): Promise<Service> {
    const company = await this.companyRepository.findById(data.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    // Item da Lista de Serviços (LC 116/2003): "N.NN" ou "NN.NN" ou "N.NN-NN"
    if (!/^\d{1,2}\.\d{2}(-\d{2})?$/.test(data.itemListaServico)) {
      throw new ValidationError(
        'itemListaServico deve seguir o formato "1.05" ou "17.05" da LC 116/2003',
        { field: 'itemListaServico' },
      );
    }

    const existing = await this.serviceRepository.findByCodigo(data.companyId, data.codigo);
    if (existing) {
      throw new BusinessRuleError(
        'Já existe um serviço com este código nesta empresa',
        'SERVICE_CODE_DUPLICATE',
      );
    }

    const { initialTaxRule, ...serviceData } = data;
    const service = await this.serviceRepository.create(serviceData);

    if (initialTaxRule) {
      const validFrom = new Date(initialTaxRule.validFrom);
      const validTo = initialTaxRule.validTo ? new Date(initialTaxRule.validTo) : null;
      if (validTo && validTo <= validFrom) {
        throw new ValidationError('validTo deve ser posterior a validFrom', {
          field: 'initialTaxRule.validTo',
        });
      }
      await this.taxRuleRepository.create({
        ...initialTaxRule,
        serviceId: service.id,
        validFrom,
        validTo,
      });
    }

    return service;
  }
}

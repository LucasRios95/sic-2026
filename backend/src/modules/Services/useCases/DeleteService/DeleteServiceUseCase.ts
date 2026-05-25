import { inject, injectable } from 'tsyringe';

import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { IServiceRepository } from '../../repositories/IServiceRepository';
import { IServiceTaxRuleRepository } from '../../repositories/IServiceTaxRuleRepository';

@injectable()
export class DeleteServiceUseCase {
  constructor(
    @inject('ServiceRepository')
    private readonly serviceRepository: IServiceRepository,

    @inject('ServiceTaxRuleRepository')
    private readonly taxRuleRepository: IServiceTaxRuleRepository,
  ) {}

  async execute(companyId: string, serviceId: string): Promise<void> {
    const service = await this.serviceRepository.findById(companyId, serviceId);
    if (!service) throw new NotFoundError('Serviço não encontrado');

    const rules = await this.taxRuleRepository.listByService(serviceId);
    if (rules.length > 0) {
      const now = Date.now();
      const allClosed = rules.every((r) => r.validTo && r.validTo.getTime() <= now);
      if (!allClosed) {
        throw new BusinessRuleError(
          'Serviço possui regra tributária vigente ou futura. Encerre a vigência antes de desativar.',
          'SERVICE_HAS_ACTIVE_TAX_RULE',
        );
      }
    }

    await this.serviceRepository.softDelete(companyId, serviceId);
  }
}

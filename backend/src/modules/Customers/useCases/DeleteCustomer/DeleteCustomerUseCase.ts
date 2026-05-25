import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { ICustomerRepository } from '../../repositories/ICustomerRepository';

@injectable()
export class DeleteCustomerUseCase {
  constructor(
    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,
  ) {}

  /**
   * Soft delete: o cadastro fica indisponível para novas emissões mas continua íntegro
   * para vínculos históricos (NF-e já emitidas, títulos abertos). Recuperação requer
   * `UPDATE` direto no banco com auditoria — fora da API.
   */
  async execute(companyId: string, customerId: string): Promise<void> {
    const customer = await this.customerRepository.findById(companyId, customerId);
    if (!customer) throw new NotFoundError('Cliente não encontrado');
    await this.customerRepository.softDelete(companyId, customerId);
  }
}

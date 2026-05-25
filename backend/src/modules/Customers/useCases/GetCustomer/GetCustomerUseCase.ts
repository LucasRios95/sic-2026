import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { Customer } from '../../infra/typeorm/entities/Customer';
import { ICustomerRepository } from '../../repositories/ICustomerRepository';

@injectable()
export class GetCustomerUseCase {
  constructor(
    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,
  ) {}

  async execute(companyId: string, customerId: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(companyId, customerId);
    if (!customer) throw new NotFoundError('Cliente não encontrado');
    return customer;
  }
}

import { inject, injectable } from 'tsyringe';

import { IListCustomersFilter } from '../../dtos/CustomerDTOs';
import { Customer } from '../../infra/typeorm/entities/Customer';
import {
  ICustomerRepository,
  ListResult,
} from '../../repositories/ICustomerRepository';

@injectable()
export class ListCustomersUseCase {
  constructor(
    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,
  ) {}

  async execute(filter: IListCustomersFilter): Promise<ListResult<Customer>> {
    return this.customerRepository.list(filter);
  }
}

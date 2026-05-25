import { inject, injectable } from 'tsyringe';

import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';

import { IListServicesFilter } from '../../dtos/ServiceDTOs';
import { Service } from '../../infra/typeorm/entities/Service';
import { IServiceRepository } from '../../repositories/IServiceRepository';

@injectable()
export class ListServicesUseCase {
  constructor(
    @inject('ServiceRepository')
    private readonly serviceRepository: IServiceRepository,
  ) {}

  async execute(filter: IListServicesFilter): Promise<ListResult<Service>> {
    return this.serviceRepository.list(filter);
  }
}

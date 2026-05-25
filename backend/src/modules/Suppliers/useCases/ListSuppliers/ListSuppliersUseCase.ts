import { inject, injectable } from 'tsyringe';

import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';

import { IListSuppliersFilter } from '../../dtos/SupplierDTOs';
import { Supplier } from '../../infra/typeorm/entities/Supplier';
import { ISupplierRepository } from '../../repositories/ISupplierRepository';

@injectable()
export class ListSuppliersUseCase {
  constructor(
    @inject('SupplierRepository')
    private readonly supplierRepository: ISupplierRepository,
  ) {}

  async execute(filter: IListSuppliersFilter): Promise<ListResult<Supplier>> {
    return this.supplierRepository.list(filter);
  }
}

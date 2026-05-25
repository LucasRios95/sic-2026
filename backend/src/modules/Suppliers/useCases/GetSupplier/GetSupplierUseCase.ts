import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { Supplier } from '../../infra/typeorm/entities/Supplier';
import { ISupplierRepository } from '../../repositories/ISupplierRepository';

@injectable()
export class GetSupplierUseCase {
  constructor(
    @inject('SupplierRepository')
    private readonly supplierRepository: ISupplierRepository,
  ) {}

  async execute(companyId: string, supplierId: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findById(companyId, supplierId);
    if (!supplier) throw new NotFoundError('Fornecedor não encontrado');
    return supplier;
  }
}

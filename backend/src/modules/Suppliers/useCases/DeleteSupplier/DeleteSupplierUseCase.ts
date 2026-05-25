import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { ISupplierRepository } from '../../repositories/ISupplierRepository';

@injectable()
export class DeleteSupplierUseCase {
  constructor(
    @inject('SupplierRepository')
    private readonly supplierRepository: ISupplierRepository,
  ) {}

  async execute(companyId: string, supplierId: string): Promise<void> {
    const supplier = await this.supplierRepository.findById(companyId, supplierId);
    if (!supplier) throw new NotFoundError('Fornecedor não encontrado');
    await this.supplierRepository.softDelete(companyId, supplierId);
  }
}

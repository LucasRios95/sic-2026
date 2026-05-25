import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { IUpdateSupplierDTO } from '../../dtos/SupplierDTOs';
import { Supplier } from '../../infra/typeorm/entities/Supplier';
import { ISupplierRepository } from '../../repositories/ISupplierRepository';

interface IRequest {
  companyId: string;
  supplierId: string;
  data: IUpdateSupplierDTO;
}

@injectable()
export class UpdateSupplierUseCase {
  constructor(
    @inject('SupplierRepository')
    private readonly supplierRepository: ISupplierRepository,
  ) {}

  async execute({ companyId, supplierId, data }: IRequest): Promise<Supplier> {
    const existing = await this.supplierRepository.findById(companyId, supplierId);
    if (!existing) throw new NotFoundError('Fornecedor não encontrado');
    return this.supplierRepository.update(supplierId, data);
  }
}

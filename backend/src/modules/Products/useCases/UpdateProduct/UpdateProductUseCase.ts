import { inject, injectable } from 'tsyringe';

import { NotFoundError, ValidationError } from '@shared/errors';

import { IUpdateProductDTO } from '../../dtos/ProductDTOs';
import { Product } from '../../infra/typeorm/entities/Product';
import { IProductRepository } from '../../repositories/IProductRepository';

interface IRequest {
  companyId: string;
  productId: string;
  data: IUpdateProductDTO;
}

@injectable()
export class UpdateProductUseCase {
  constructor(
    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,
  ) {}

  async execute({ companyId, productId, data }: IRequest): Promise<Product> {
    const existing = await this.productRepository.findById(companyId, productId);
    if (!existing) throw new NotFoundError('Produto não encontrado');

    if (data.ncm && !/^\d{8}$/.test(data.ncm)) {
      throw new ValidationError('NCM deve ter 8 dígitos numéricos', { field: 'ncm' });
    }
    if (data.cest && !/^\d{7}$/.test(data.cest)) {
      throw new ValidationError('CEST deve ter 7 dígitos numéricos', { field: 'cest' });
    }
    if (data.origem !== undefined && (data.origem < 0 || data.origem > 8)) {
      throw new ValidationError('origem deve estar entre 0 e 8', { field: 'origem' });
    }

    return this.productRepository.update(productId, data);
  }
}

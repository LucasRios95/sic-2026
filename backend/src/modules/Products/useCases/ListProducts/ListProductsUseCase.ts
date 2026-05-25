import { inject, injectable } from 'tsyringe';

import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';

import { IListProductsFilter } from '../../dtos/ProductDTOs';
import { Product } from '../../infra/typeorm/entities/Product';
import { IProductRepository } from '../../repositories/IProductRepository';

@injectable()
export class ListProductsUseCase {
  constructor(
    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,
  ) {}

  async execute(filter: IListProductsFilter): Promise<ListResult<Product>> {
    return this.productRepository.list(filter);
  }
}

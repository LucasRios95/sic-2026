import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { Product } from '../../infra/typeorm/entities/Product';
import { ProductTaxRule } from '../../infra/typeorm/entities/ProductTaxRule';
import { IProductRepository } from '../../repositories/IProductRepository';
import { IProductTaxRuleRepository } from '../../repositories/IProductTaxRuleRepository';

interface IResponse {
  product: Product;
  taxRules: ProductTaxRule[];
}

@injectable()
export class GetProductUseCase {
  constructor(
    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,

    @inject('ProductTaxRuleRepository')
    private readonly taxRuleRepository: IProductTaxRuleRepository,
  ) {}

  async execute(companyId: string, productId: string): Promise<IResponse> {
    const product = await this.productRepository.findById(companyId, productId);
    if (!product) throw new NotFoundError('Produto não encontrado');

    const taxRules = await this.taxRuleRepository.listByProduct(productId);
    return { product, taxRules };
  }
}

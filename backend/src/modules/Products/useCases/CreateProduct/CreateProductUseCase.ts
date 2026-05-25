import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

import { ICreateProductDTO } from '../../dtos/ProductDTOs';
import { Product } from '../../infra/typeorm/entities/Product';
import { IProductRepository } from '../../repositories/IProductRepository';
import { IProductTaxRuleRepository } from '../../repositories/IProductTaxRuleRepository';

@injectable()
export class CreateProductUseCase {
  constructor(
    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,

    @inject('ProductTaxRuleRepository')
    private readonly taxRuleRepository: IProductTaxRuleRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,
  ) {}

  /**
   * Cria produto e, opcionalmente, sua primeira regra tributária. Quando o cliente envia
   * `initialTaxRule`, persistimos a regra junto — fluxo comum no onboarding (planilha em massa).
   * Caso contrário, o produto fica "sem regra vigente" e o motor tributário gera erro de
   * configuração compreensível na hora da emissão (NF-e EP-07).
   */
  async execute(data: ICreateProductDTO): Promise<Product> {
    const company = await this.companyRepository.findById(data.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    if (!/^\d{8}$/.test(data.ncm)) {
      throw new ValidationError('NCM deve ter 8 dígitos numéricos', { field: 'ncm' });
    }
    if (data.cest && !/^\d{7}$/.test(data.cest)) {
      throw new ValidationError('CEST deve ter 7 dígitos numéricos', { field: 'cest' });
    }
    if (data.origem < 0 || data.origem > 8) {
      throw new ValidationError('origem deve estar entre 0 e 8', { field: 'origem' });
    }

    const existing = await this.productRepository.findByCodigo(data.companyId, data.codigo);
    if (existing) {
      throw new BusinessRuleError(
        'Já existe um produto com este código nesta empresa',
        'PRODUCT_CODE_DUPLICATE',
      );
    }

    const { initialTaxRule, ...productData } = data;
    const product = await this.productRepository.create(productData);

    if (initialTaxRule) {
      const validFrom = new Date(initialTaxRule.validFrom);
      const validTo = initialTaxRule.validTo ? new Date(initialTaxRule.validTo) : null;
      if (validTo && validTo <= validFrom) {
        throw new ValidationError('validTo deve ser posterior a validFrom', {
          field: 'initialTaxRule.validTo',
        });
      }
      await this.taxRuleRepository.create({
        ...initialTaxRule,
        productId: product.id,
        validFrom,
        validTo,
      });
    }

    return product;
  }
}

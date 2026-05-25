import { inject, injectable } from 'tsyringe';

import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';
import { hasOverlap } from '@shared/domain/validity-window';

import { IProductTaxRuleDTO } from '../../dtos/ProductDTOs';
import { ProductTaxRule } from '../../infra/typeorm/entities/ProductTaxRule';
import { IProductRepository } from '../../repositories/IProductRepository';
import { IProductTaxRuleRepository } from '../../repositories/IProductTaxRuleRepository';

interface IRequest {
  companyId: string;
  productId: string;
  data: IProductTaxRuleDTO;
}

@injectable()
export class AddProductTaxRuleUseCase {
  constructor(
    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,

    @inject('ProductTaxRuleRepository')
    private readonly taxRuleRepository: IProductTaxRuleRepository,
  ) {}

  /**
   * Adiciona uma nova regra tributária ao produto, rejeitando sobreposição com janelas
   * existentes. Em uma transição (ex.: alíquota muda no dia D), o fluxo correto é fechar
   * a regra atual com `validTo = D` ANTES de inserir a nova com `validFrom = D`.
   *
   * Concorrência: a verificação de sobreposição em duas etapas (read + write) é vulnerável
   * a corrida. Quando o produto entrar em fluxo de alta concorrência (raro para regras
   * tributárias — costumam ser editadas manualmente pelo fiscal), promover para `SERIALIZABLE`
   * ou usar advisory lock por productId no Postgres.
   */
  async execute({ companyId, productId, data }: IRequest): Promise<ProductTaxRule> {
    const product = await this.productRepository.findById(companyId, productId);
    if (!product) throw new NotFoundError('Produto não encontrado');

    const validFrom = new Date(data.validFrom);
    const validTo = data.validTo ? new Date(data.validTo) : null;
    if (validTo && validTo <= validFrom) {
      throw new ValidationError('validTo deve ser posterior a validFrom', { field: 'validTo' });
    }

    const existing = await this.taxRuleRepository.listByProduct(productId);
    if (hasOverlap({ validFrom, validTo }, existing)) {
      throw new BusinessRuleError(
        'A janela de vigência conflita com uma regra existente. Encerre a regra atual antes de criar a nova.',
        'PRODUCT_TAX_RULE_OVERLAP',
        {
          existingWindows: existing.map((r) => ({
            id: r.id,
            validFrom: r.validFrom,
            validTo: r.validTo,
          })),
        },
      );
    }

    return this.taxRuleRepository.create({
      ...data,
      productId,
      validFrom,
      validTo,
    });
  }
}

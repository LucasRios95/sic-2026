import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { IProductTaxRuleDTO } from '../../dtos/ProductDTOs';
import { ProductTaxRule } from '../../infra/typeorm/entities/ProductTaxRule';
import { IProductRepository } from '../../repositories/IProductRepository';
import { IProductTaxRuleRepository } from '../../repositories/IProductTaxRuleRepository';

interface IRequest {
  companyId: string;
  productId: string;
  data: Omit<IProductTaxRuleDTO, 'validFrom' | 'validTo'>;
}

/**
 * Substitui a regra tributária VIGENTE por uma nova. Operação composta:
 *  1) Encerra a regra atualmente aberta (validTo = NULL) carimbando validTo = "agora".
 *  2) Cria uma nova regra com validFrom = "agora" e validTo = NULL.
 *
 * Usar este caminho para correções manuais via UI ("editar regra do produto"). O fluxo
 * de transição programada (alíquota muda no dia D no futuro) deve usar `AddProductTaxRule`
 * direto com a janela desejada.
 *
 * Mantém o histórico: a regra antiga não é apagada, só fechada. O motor tributário
 * (`findActiveAt(now)`) passa a usar a nova imediatamente.
 */
@injectable()
export class ReplaceCurrentTaxRuleUseCase {
  constructor(
    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,

    @inject('ProductTaxRuleRepository')
    private readonly taxRuleRepository: IProductTaxRuleRepository,
  ) {}

  async execute({ companyId, productId, data }: IRequest): Promise<ProductTaxRule> {
    const product = await this.productRepository.findById(companyId, productId);
    if (!product) throw new NotFoundError('Produto não encontrado');

    const now = new Date();
    const current = await this.taxRuleRepository.findActiveAt(productId, now);
    if (current) {
      await this.taxRuleRepository.setValidTo(current.id, now);
    }

    return this.taxRuleRepository.create({
      ...data,
      productId,
      validFrom: now,
      validTo: null,
    });
  }
}

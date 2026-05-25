import { inject, injectable } from 'tsyringe';

import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { IProductRepository } from '../../repositories/IProductRepository';
import { IProductTaxRuleRepository } from '../../repositories/IProductTaxRuleRepository';

@injectable()
export class DeleteProductUseCase {
  constructor(
    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,

    @inject('ProductTaxRuleRepository')
    private readonly taxRuleRepository: IProductTaxRuleRepository,
  ) {}

  /**
   * Recusa desativar o produto se houver regra tributária com vigência futura aberta —
   * sinal de que alguém configurou esse produto para uma operação que ainda vai acontecer.
   * Exige cancelar a regra antes ou usar a ação dedicada (não escopada nesta fase).
   */
  async execute(companyId: string, productId: string): Promise<void> {
    const product = await this.productRepository.findById(companyId, productId);
    if (!product) throw new NotFoundError('Produto não encontrado');

    const rules = await this.taxRuleRepository.listByProduct(productId);
    const now = Date.now();
    const hasFutureOpenRule = rules.some(
      (r) => (r.validTo === null || r.validTo === undefined || r.validTo.getTime() > now),
    );
    if (hasFutureOpenRule && rules.length > 0) {
      // Produtos sem nenhuma regra (rules.length === 0) podem ser deletados sem entrave.
      const allClosed = rules.every((r) => r.validTo && r.validTo.getTime() <= now);
      if (!allClosed) {
        throw new BusinessRuleError(
          'Produto possui regra tributária vigente ou futura. Encerre a vigência antes de desativar.',
          'PRODUCT_HAS_ACTIVE_TAX_RULE',
        );
      }
    }

    await this.productRepository.softDelete(companyId, productId);
  }
}

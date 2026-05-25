import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { appDataSource } from '@shared/infra/typeorm/data-source';

import {
  CreateProductTaxRuleData,
  IProductTaxRuleRepository,
} from '../../../repositories/IProductTaxRuleRepository';
import { ProductTaxRule } from '../entities/ProductTaxRule';

export class ProductTaxRuleRepository implements IProductTaxRuleRepository {
  private readonly repo: Repository<ProductTaxRule>;

  constructor() {
    this.repo = appDataSource.getRepository(ProductTaxRule);
  }

  async create(data: CreateProductTaxRuleData): Promise<ProductTaxRule> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async listByProduct(productId: string): Promise<ProductTaxRule[]> {
    return this.repo.find({ where: { productId }, order: { validFrom: 'ASC' } });
  }

  async findActiveAt(productId: string, date: Date): Promise<ProductTaxRule | null> {
    // Tenta primeiro o caminho mais comum (janela aberta — validTo IS NULL), que tem índice parcial dedicado.
    const open = await this.repo.findOne({
      where: { productId, validFrom: LessThanOrEqual(date), validTo: IsNull() },
      order: { validFrom: 'DESC' },
    });
    if (open) return open;

    // Caso contrário, busca a janela fechada que cobre D.
    return this.repo.findOne({
      where: { productId, validFrom: LessThanOrEqual(date), validTo: MoreThan(date) },
      order: { validFrom: 'DESC' },
    });
  }
}

import { inject, injectable } from 'tsyringe';

import { TaxParameter } from '../../infra/typeorm/entities/TaxParameter';
import {
  ITaxParameterRepository,
  ListTaxParametersFilter,
} from '../../repositories/ITaxParameterRepository';

@injectable()
export class ListTaxParametersUseCase {
  constructor(
    @inject('TaxParameterRepository')
    private readonly repo: ITaxParameterRepository,
  ) {}

  async execute(filter: ListTaxParametersFilter): Promise<TaxParameter[]> {
    return this.repo.list(filter);
  }
}

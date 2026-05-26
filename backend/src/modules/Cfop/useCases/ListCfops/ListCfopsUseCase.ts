import { inject, injectable } from 'tsyringe';

import { Cfop } from '../../infra/typeorm/entities/Cfop';
import { ICfopRepository, ListCfopsFilter } from '../../repositories/ICfopRepository';

@injectable()
export class ListCfopsUseCase {
  constructor(
    @inject('CfopRepository')
    private readonly repo: ICfopRepository,
  ) {}

  async execute(filter: ListCfopsFilter): Promise<Cfop[]> {
    return this.repo.list(filter);
  }
}

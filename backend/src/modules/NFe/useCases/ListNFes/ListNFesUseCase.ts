import { inject, injectable } from 'tsyringe';

import { INFeRepository, ListNFesFilter } from '../../repositories/INFeRepository';

@injectable()
export class ListNFesUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly repo: INFeRepository,
  ) {}

  async execute(filter: ListNFesFilter) {
    return this.repo.list(filter);
  }
}

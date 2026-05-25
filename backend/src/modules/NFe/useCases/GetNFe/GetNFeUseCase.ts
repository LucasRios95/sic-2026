import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { NFe } from '../../infra/typeorm/entities/NFe';
import { INFeRepository } from '../../repositories/INFeRepository';

@injectable()
export class GetNFeUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly repo: INFeRepository,
  ) {}

  async execute(companyId: string, id: string): Promise<NFe> {
    const nfe = await this.repo.findByIdWithRelations(companyId, id);
    if (!nfe) throw new NotFoundError('NF-e não encontrada');
    return nfe;
  }
}

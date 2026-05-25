import { inject, injectable } from 'tsyringe';

import { Certificate } from '../../infra/typeorm/entities/Certificate';
import { ICertificateRepository } from '../../repositories/ICertificateRepository';

@injectable()
export class ListCertificatesUseCase {
  constructor(
    @inject('CertificateRepository')
    private readonly repo: ICertificateRepository,
  ) {}

  async execute(companyId: string): Promise<Certificate[]> {
    return this.repo.listByCompany(companyId);
  }
}

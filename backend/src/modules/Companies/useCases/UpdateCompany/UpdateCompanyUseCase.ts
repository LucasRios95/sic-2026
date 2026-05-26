import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { Company } from '../../infra/typeorm/entities/Company';
import {
  ICompanyRepository,
  IUpdateCompanyDTO,
} from '../../repositories/ICompanyRepository';

interface IRequest {
  id: string;
  data: IUpdateCompanyDTO;
}

/**
 * Atualização parcial dos dados da empresa. CNPJ e tenant ficam imutáveis
 * — alterar afetaria chave de acesso da NF-e histórica e isolamento multi-tenant.
 *
 * Casos de uso típicos: mudar `ambienteSefaz` de HOMOLOGACAO → PRODUCAO
 * quando o cliente conclui homologação; trocar endereço/IE após mudança fiscal;
 * habilitar `usaIcmsSt` quando o perfil da empresa mudar.
 */
@injectable()
export class UpdateCompanyUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute({ id, data }: IRequest): Promise<Company> {
    const existing = await this.companyRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Empresa não encontrada');
    }
    return this.companyRepository.update(id, data);
  }
}

import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';
import { TipoPessoa } from '@shared/types/fiscal-enums';
import {
  isValidCnpj,
  isValidCpf,
  normalizeDigits,
} from '@shared/utils/document-validators';

import { ICreateCustomerDTO } from '../../dtos/CustomerDTOs';
import { Customer } from '../../infra/typeorm/entities/Customer';
import { ICustomerRepository } from '../../repositories/ICustomerRepository';

@injectable()
export class CreateCustomerUseCase {
  constructor(
    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(data: ICreateCustomerDTO): Promise<Customer> {
    const company = await this.companyRepository.findById(data.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    // Estrangeiros podem ter identificador qualquer; PF/PJ exigem CPF/CNPJ válidos.
    const cnpjCpf =
      data.tipoPessoa === TipoPessoa.ESTRANGEIRO ? data.cnpjCpf : normalizeDigits(data.cnpjCpf);

    if (data.tipoPessoa === TipoPessoa.PJ && !isValidCnpj(cnpjCpf)) {
      throw new ValidationError('CNPJ inválido', { field: 'cnpjCpf' });
    }
    if (data.tipoPessoa === TipoPessoa.PF && !isValidCpf(cnpjCpf)) {
      throw new ValidationError('CPF inválido', { field: 'cnpjCpf' });
    }

    const existing = await this.customerRepository.findByCnpjCpf(data.companyId, cnpjCpf);
    if (existing) {
      throw new BusinessRuleError(
        'Já existe um cliente com este CNPJ/CPF nesta empresa',
        'CUSTOMER_DOC_DUPLICATE',
      );
    }

    return this.customerRepository.create({ ...data, cnpjCpf });
  }
}

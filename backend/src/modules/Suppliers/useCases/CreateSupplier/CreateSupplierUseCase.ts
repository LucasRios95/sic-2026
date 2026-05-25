import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';
import { TipoPessoa } from '@shared/types/fiscal-enums';
import {
  isValidCnpj,
  isValidCpf,
  normalizeDigits,
} from '@shared/utils/document-validators';

import { ICreateSupplierDTO } from '../../dtos/SupplierDTOs';
import { Supplier } from '../../infra/typeorm/entities/Supplier';
import { ISupplierRepository } from '../../repositories/ISupplierRepository';

@injectable()
export class CreateSupplierUseCase {
  constructor(
    @inject('SupplierRepository')
    private readonly supplierRepository: ISupplierRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(data: ICreateSupplierDTO): Promise<Supplier> {
    const company = await this.companyRepository.findById(data.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    const cnpjCpf =
      data.tipoPessoa === TipoPessoa.ESTRANGEIRO ? data.cnpjCpf : normalizeDigits(data.cnpjCpf);

    if (data.tipoPessoa === TipoPessoa.PJ && !isValidCnpj(cnpjCpf)) {
      throw new ValidationError('CNPJ inválido', { field: 'cnpjCpf' });
    }
    if (data.tipoPessoa === TipoPessoa.PF && !isValidCpf(cnpjCpf)) {
      throw new ValidationError('CPF inválido', { field: 'cnpjCpf' });
    }

    const existing = await this.supplierRepository.findByCnpjCpf(data.companyId, cnpjCpf);
    if (existing) {
      throw new BusinessRuleError(
        'Já existe um fornecedor com este CNPJ/CPF nesta empresa',
        'SUPPLIER_DOC_DUPLICATE',
      );
    }

    return this.supplierRepository.create({ ...data, cnpjCpf });
  }
}

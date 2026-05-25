import { inject, injectable } from 'tsyringe';

import { ITenantRepository } from '@modules/Tenants/repositories/ITenantRepository';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

import { ICreateCompanyDTO } from '../../dtos/ICreateCompanyDTO';
import { Company } from '../../infra/typeorm/entities/Company';
import { ICompanyRepository } from '../../repositories/ICompanyRepository';

@injectable()
export class CreateCompanyUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('TenantRepository')
    private readonly tenantRepository: ITenantRepository,
  ) {}

  async execute(data: ICreateCompanyDTO): Promise<Company> {
    if (!isValidCnpj(data.cnpj)) {
      throw new ValidationError('CNPJ inválido', { field: 'cnpj' });
    }

    const tenant = await this.tenantRepository.findById(data.tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant não encontrado');
    }

    const existing = await this.companyRepository.findByCnpj(data.cnpj);
    if (existing) {
      throw new BusinessRuleError(
        'Já existe uma empresa com este CNPJ',
        'COMPANY_CNPJ_DUPLICATE',
      );
    }

    return this.companyRepository.create(data);
  }
}

/**
 * Validação de CNPJ com dois dígitos verificadores conforme algoritmo da Receita Federal.
 * Aceita o valor com ou sem formatação ("12.345.678/0001-99" ou "12345678000199"),
 * mas o repositório persiste sempre apenas dígitos.
 */
export function isValidCnpj(value: string): boolean {
  const cnpj = value.replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split('')
      .reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(cnpj.slice(0, 12), w1);
  const d2 = calcDigit(cnpj.slice(0, 12) + d1, w2);
  return cnpj.endsWith(`${d1}${d2}`);
}

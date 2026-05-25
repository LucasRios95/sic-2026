import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { IUpdateCustomerDTO } from '../../dtos/CustomerDTOs';
import { Customer } from '../../infra/typeorm/entities/Customer';
import { ICustomerRepository } from '../../repositories/ICustomerRepository';

interface IRequest {
  companyId: string;
  customerId: string;
  data: IUpdateCustomerDTO;
}

@injectable()
export class UpdateCustomerUseCase {
  constructor(
    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,
  ) {}

  /**
   * Não permite alterar `cnpjCpf` nem `tipoPessoa` no update (ver IUpdateCustomerDTO).
   * Trocar a identidade fiscal de um cliente já vinculado a NF-e/títulos quebraria a
   * rastreabilidade fiscal — a operação correta é criar outro cliente e refazer os vínculos.
   */
  async execute({ companyId, customerId, data }: IRequest): Promise<Customer> {
    const existing = await this.customerRepository.findById(companyId, customerId);
    if (!existing) throw new NotFoundError('Cliente não encontrado');

    return this.customerRepository.update(customerId, data);
  }
}

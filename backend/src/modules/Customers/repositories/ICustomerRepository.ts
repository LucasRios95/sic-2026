import { ICreateCustomerDTO, IListCustomersFilter, IUpdateCustomerDTO } from '../dtos/CustomerDTOs';
import { Customer } from '../infra/typeorm/entities/Customer';

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface ICustomerRepository {
  create(data: ICreateCustomerDTO): Promise<Customer>;
  update(id: string, data: IUpdateCustomerDTO): Promise<Customer>;
  findById(companyId: string, id: string): Promise<Customer | null>;
  findByCnpjCpf(companyId: string, cnpjCpf: string): Promise<Customer | null>;
  list(filter: IListCustomersFilter): Promise<ListResult<Customer>>;
  softDelete(companyId: string, id: string): Promise<void>;
}

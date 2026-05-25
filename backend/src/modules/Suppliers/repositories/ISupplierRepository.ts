import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';

import {
  ICreateSupplierDTO,
  IListSuppliersFilter,
  IUpdateSupplierDTO,
} from '../dtos/SupplierDTOs';
import { Supplier } from '../infra/typeorm/entities/Supplier';

export interface ISupplierRepository {
  create(data: ICreateSupplierDTO): Promise<Supplier>;
  update(id: string, data: IUpdateSupplierDTO): Promise<Supplier>;
  findById(companyId: string, id: string): Promise<Supplier | null>;
  findByCnpjCpf(companyId: string, cnpjCpf: string): Promise<Supplier | null>;
  list(filter: IListSuppliersFilter): Promise<ListResult<Supplier>>;
  softDelete(companyId: string, id: string): Promise<void>;
}

import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';

import { IListServicesFilter, IUpdateServiceDTO } from '../dtos/ServiceDTOs';
import { Service } from '../infra/typeorm/entities/Service';

export interface CreateServiceData {
  companyId: string;
  codigo: string;
  descricao: string;
  codigoTributacaoNacional?: string | null;
  itemListaServico: string;
  codigoTributacaoMunicipal?: string | null;
  cnae?: string | null;
}

export interface IServiceRepository {
  create(data: CreateServiceData): Promise<Service>;
  update(id: string, data: IUpdateServiceDTO): Promise<Service>;
  findById(companyId: string, id: string): Promise<Service | null>;
  findByCodigo(companyId: string, codigo: string): Promise<Service | null>;
  list(filter: IListServicesFilter): Promise<ListResult<Service>>;
  softDelete(companyId: string, id: string): Promise<void>;
}

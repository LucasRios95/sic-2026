import { ListResult } from '@modules/Customers/repositories/ICustomerRepository';

import { IListProductsFilter, IUpdateProductDTO } from '../dtos/ProductDTOs';
import { Product } from '../infra/typeorm/entities/Product';

export interface CreateProductData {
  companyId: string;
  codigo: string;
  codigoBarras?: string | null;
  descricao: string;
  ncm: string;
  cest?: string | null;
  origem: number;
  unidadeComercial: string;
  unidadeTributavel: string;
  pesoLiquido?: string | null;
  pesoBruto?: string | null;
  controlaEstoque?: boolean;
}

export interface IProductRepository {
  create(data: CreateProductData): Promise<Product>;
  update(id: string, data: IUpdateProductDTO): Promise<Product>;
  findById(companyId: string, id: string): Promise<Product | null>;
  findByCodigo(companyId: string, codigo: string): Promise<Product | null>;
  list(filter: IListProductsFilter): Promise<ListResult<Product>>;
  softDelete(companyId: string, id: string): Promise<void>;
}

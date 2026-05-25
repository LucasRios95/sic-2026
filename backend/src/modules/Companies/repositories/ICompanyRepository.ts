import { ICreateCompanyDTO } from '../dtos/ICreateCompanyDTO';
import { Company } from '../infra/typeorm/entities/Company';

export interface ICompanyRepository {
  create(data: ICreateCompanyDTO): Promise<Company>;
  findById(id: string): Promise<Company | null>;
  findByCnpj(cnpj: string): Promise<Company | null>;
  findByIds(ids: string[]): Promise<Company[]>;
  listByTenant(tenantId: string): Promise<Company[]>;
}

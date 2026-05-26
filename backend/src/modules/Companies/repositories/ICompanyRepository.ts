import { ICreateCompanyDTO } from '../dtos/ICreateCompanyDTO';
import { Company } from '../infra/typeorm/entities/Company';

export type IUpdateCompanyDTO = Partial<Omit<ICreateCompanyDTO, 'cnpj' | 'tenantId'>>;

export interface ICompanyRepository {
  create(data: ICreateCompanyDTO): Promise<Company>;
  /** Update parcial — cnpj e tenantId não podem mudar (identitários). */
  update(id: string, data: IUpdateCompanyDTO): Promise<Company>;
  findById(id: string): Promise<Company | null>;
  findByCnpj(cnpj: string): Promise<Company | null>;
  findByIds(ids: string[]): Promise<Company[]>;
  listByTenant(tenantId: string): Promise<Company[]>;
}

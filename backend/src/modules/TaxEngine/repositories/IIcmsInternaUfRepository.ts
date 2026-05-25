import { IcmsInternaUf } from '../infra/typeorm/entities/IcmsInternaUf';

export interface IIcmsInternaUfRepository {
  findActiveAt(uf: string, at: Date): Promise<IcmsInternaUf | null>;
  upsert(data: Omit<IcmsInternaUf, 'id' | 'createdAt' | 'updatedAt'>): Promise<IcmsInternaUf>;
}

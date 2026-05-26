import { IcmsStMva } from '../infra/typeorm/entities/IcmsStMva';

export interface IIcmsStMvaRepository {
  findActiveAt(
    ufOrigem: string,
    ufDestino: string,
    ncm: string,
    at: Date,
  ): Promise<IcmsStMva | null>;
  upsert(data: Omit<IcmsStMva, 'id' | 'createdAt' | 'updatedAt'>): Promise<IcmsStMva>;
  /** Lista todas as MVAs cadastradas — usada na UI admin. */
  listAll(): Promise<IcmsStMva[]>;
}

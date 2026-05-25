import { TaxParameter } from '../infra/typeorm/entities/TaxParameter';

export interface ITaxParameterRepository {
  /**
   * Busca o parâmetro vigente para uma chave. Empresa-específico tem precedência sobre global.
   * Quando `companyId` é informado, retorna o parâmetro daquela empresa se existir;
   * caso contrário, retorna o global (`companyId IS NULL`).
   */
  findActiveAt(chave: string, companyId: string | null, at: Date): Promise<TaxParameter | null>;
  upsert(data: Omit<TaxParameter, 'id' | 'createdAt' | 'updatedAt' | 'company'>): Promise<TaxParameter>;
}

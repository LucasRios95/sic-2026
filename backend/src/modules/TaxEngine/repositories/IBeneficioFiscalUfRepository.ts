import { BeneficioFiscalUf } from '../infra/typeorm/entities/BeneficioFiscalUf';

export interface IBeneficioFiscalUfRepository {
  /**
   * Busca benefício aplicável a uma operação em determinada UF na data D.
   * Quando `ncm` é informado, prefere benefícios específicos do NCM; cai para
   * benefícios "genéricos" (ncm IS NULL) caso não encontre.
   */
  findActiveAt(uf: string, ncm: string | null, at: Date): Promise<BeneficioFiscalUf | null>;
  upsert(data: Omit<BeneficioFiscalUf, 'id' | 'createdAt' | 'updatedAt'>): Promise<BeneficioFiscalUf>;
}

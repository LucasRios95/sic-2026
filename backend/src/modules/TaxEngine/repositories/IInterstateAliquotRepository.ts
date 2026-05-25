import { InterstateAliquot } from '../infra/typeorm/entities/InterstateAliquot';

export interface IInterstateAliquotRepository {
  /**
   * Busca a alíquota interestadual vigente em D para o par (origem, destino).
   * `D` é o momento da operação (data de emissão da NF-e).
   */
  findActiveAt(ufOrigem: string, ufDestino: string, at: Date): Promise<InterstateAliquot | null>;

  /** Inserir / atualizar via processo de atualização normativa. */
  upsert(data: Omit<InterstateAliquot, 'id' | 'createdAt' | 'updatedAt'>): Promise<InterstateAliquot>;
}

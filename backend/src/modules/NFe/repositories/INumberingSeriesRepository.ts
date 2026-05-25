/**
 * Reserva atômica de número de NF-e. Implementações devem usar lock pessimista
 * (SELECT ... FOR UPDATE) ou advisory lock para garantir que dois emissores concorrentes
 * NUNCA recebam o mesmo número.
 *
 * O método retorna o número reservado e já incrementa `proximoNumero` na mesma transação.
 * Se a transação externa abortar (ex.: SEFAZ rejeitar a nota), o número fica "queimado" —
 * isso é OK e exigido pela própria SEFAZ; números pulados são tratados via Inutilização
 * (TSK-113b, fora desta entrega).
 */
export interface AllocatedNumber {
  numero: string; // BigInt como string
  serie: number;
  modelo: string;
}

export interface INumberingSeriesRepository {
  /** Garante existência de uma série; cria com proximoNumero=1 se não existir. */
  ensureSeries(companyId: string, modelo: string, serie: number): Promise<void>;

  /**
   * Aloca o próximo número de forma atômica. Deve ser chamada DENTRO de uma transação
   * — o caller passa o EntityManager dessa transação para garantir que o lock vigore.
   */
  allocateNumber(
    companyId: string,
    modelo: string,
    serie: number,
  ): Promise<AllocatedNumber>;
}

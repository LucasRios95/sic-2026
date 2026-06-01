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

  /**
   * Aloca um número ESPECÍFICO informado pelo emissor. Caso de uso: a UI permite
   * editar o número antes da emissão (faturista quer alinhar com o talão físico ou
   * preencher buracos da escrituração).
   *
   * Regras:
   *  - Número não pode estar abaixo do já usado (rejeita números repetidos)
   *  - Após sucesso, `proximoNumero` da série passa a max(numeroForçado + 1, atual)
   *    — assim emissões subsequentes continuam a sequência sem voltar atrás.
   *  - Mesma garantia de lock pessimista do `allocateNumber`.
   */
  allocateSpecificNumber(
    companyId: string,
    modelo: string,
    serie: number,
    numeroForcado: string,
  ): Promise<AllocatedNumber>;

  /**
   * Lê o próximo número da série SEM reservar. Usado pela UI pra mostrar ao
   * faturista qual será o número da próxima nota antes do submit.
   * Cria a série com proximoNumero=1 se não existir.
   */
  peekProximoNumero(companyId: string, modelo: string, serie: number): Promise<string>;

  /**
   * Lê próximo + último usado num único hit. UI usa o último como referência
   * informativa ("Último número usado: X") — o faturista digita manualmente o que vier
   * a seguir. `ultimoUsado` é null quando a série nunca foi consumida.
   */
  peekSeriesInfo(
    companyId: string,
    modelo: string,
    serie: number,
  ): Promise<{ proximoNumero: string; ultimoUsado: string | null }>;

  /**
   * Regride o contador da série QUANDO o `numero` informado é exatamente o último
   * alocado (`ultimoUsado`). Caso típico: faturista emite, recebe rejeição/erro,
   * exclui a NF-e — sem isso, o próximo emitido pularia o número descartado.
   *
   * Não regride se já houve outra alocação depois (`ultimoUsado != numero`) — devolver
   * um gap a meio da sequência criaria ambiguidade fiscal. O caller deve tratar esse
   * caso via Inutilização de numeração se quiser oficializar o salto.
   *
   * Usa lock pessimista pra evitar corrida com `allocateNumber` simultâneo.
   */
  releaseLastIfMatches(
    companyId: string,
    modelo: string,
    serie: number,
    numero: string,
  ): Promise<{ released: boolean; proximoNumero: string; ultimoUsado: string | null }>;
}

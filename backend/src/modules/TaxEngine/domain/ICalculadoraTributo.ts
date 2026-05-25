import { ContextoCalculo, ItemContexto } from './ContextoCalculo';
import { ResultadoCalculoItem } from './ResultadoCalculo';

/**
 * Estratégia de cálculo de um grupo de tributos. Cada calculadora é independente —
 * o pipeline aplica todas em sequência, na ordem definida em MotorTributario.
 *
 * Convenção:
 *  - `aplica()` retorna boolean síncrono (consulta apenas o contexto, nunca o banco).
 *  - `calcular()` retorna apenas os campos que ESTA calculadora preenche; o motor
 *    mescla no resultado consolidado.
 *  - Calculadoras NÃO modificam o item de entrada nem o resultado parcial passado.
 *
 * Princípio (PRD 6.1.1.9): o banco persiste o resultado; o cálculo vive no código.
 */
export interface CalculadoraSlice {
  /** Campos do ResultadoCalculoItem que esta calculadora preenche. */
  campos: Partial<
    Omit<ResultadoCalculoItem, 'itemId' | 'valorTotal' | 'memoria' | 'warnings'>
  >;
  /** Entrada na memória de cálculo (ou null para não registrar). */
  passo?: ResultadoCalculoItem['memoria'][number] | null;
  /** Mensagens de aviso (configuração faltante, fallback aplicado). */
  warnings?: string[];
}

export interface ICalculadoraTributo {
  /** Identificador da calculadora — aparece em logs e na memória de cálculo. */
  readonly nome: string;

  /**
   * Decide se a calculadora se aplica a este item neste contexto. Idealmente leve
   * (verifica flags da empresa, CFOP, vigência) — sem I/O.
   */
  aplica(contexto: ContextoCalculo, item: ItemContexto): boolean;

  /**
   * Calcula o slice de resultado para o item. Pode fazer I/O (consultar repositórios
   * de tabelas globais). O caller já garantiu `aplica() === true`.
   */
  calcular(contexto: ContextoCalculo, item: ItemContexto): Promise<CalculadoraSlice>;
}

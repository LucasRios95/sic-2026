import { Decimal } from 'decimal.js';

/**
 * Wrapper sobre decimal.js para valores monetários e percentuais fiscais.
 *
 * Por que não usar `number` direto:
 *  - 0.1 + 0.2 ≠ 0.3 em double JS → erros de centavo se acumulam em notas longas.
 *  - Cálculo de tributos pode ter base × alíquota × redução × MVA — várias multiplicações
 *    encadeadas que o motor tributário aplica em sequência.
 *
 * Convenções aplicadas aqui:
 *  - Precisão interna: 20 dígitos (mais que suficiente para qualquer cálculo fiscal).
 *  - Arredondamento padrão dos valores monetários: HALF_EVEN ("banker's rounding"),
 *    como exigido pela NFS-e Nacional (NT 007/2026) e adotado em conformidade pela NF-e.
 *  - Alíquotas/MVA mantêm 4 casas decimais (precisão da SEFAZ).
 *  - Valores monetários totais arredondam para 2 casas no momento da serialização.
 */
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

export type MoneyInput = string | number | Decimal | Money;

export class Money {
  private readonly value: Decimal;

  constructor(input: MoneyInput = 0) {
    if (input instanceof Money) {
      this.value = input.value;
    } else if (input instanceof Decimal) {
      this.value = input;
    } else {
      this.value = new Decimal(input);
    }
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: MoneyInput): Money {
    return new Money(this.value.plus(Money.toDecimal(other)));
  }

  sub(other: MoneyInput): Money {
    return new Money(this.value.minus(Money.toDecimal(other)));
  }

  mul(other: MoneyInput): Money {
    return new Money(this.value.times(Money.toDecimal(other)));
  }

  div(other: MoneyInput): Money {
    return new Money(this.value.div(Money.toDecimal(other)));
  }

  /** Multiplica por uma alíquota expressa em percentual (18 = 18% = ×0.18). */
  applyPercent(percent: MoneyInput): Money {
    return this.mul(Money.toDecimal(percent).div(100));
  }

  /**
   * Arredondamento HALF_EVEN para a quantidade de casas decimais informada.
   * 2 casas para valores monetários finais, 4 para alíquotas/MVA.
   */
  round(decimals = 2): Money {
    return new Money(this.value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_EVEN));
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  /** Representação para persistência (TypeORM/Postgres aceita string em colunas numeric). */
  toString(decimals?: number): string {
    return decimals !== undefined
      ? this.value.toFixed(decimals, Decimal.ROUND_HALF_EVEN)
      : this.value.toString();
  }

  /** Conversão direta para number — use só em logs/UI, nunca em cálculos. */
  toNumber(): number {
    return this.value.toNumber();
  }

  private static toDecimal(input: MoneyInput): Decimal {
    if (input instanceof Money) return input.value;
    if (input instanceof Decimal) return input;
    return new Decimal(input);
  }
}

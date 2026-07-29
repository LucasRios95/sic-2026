/**
 * Formatação numérica no padrão brasileiro (vírgula decimal, ponto de milhar).
 *
 * IMPORTANTE — isto é camada de APRESENTAÇÃO. O XML da NF-e e o contrato da API
 * exigem ponto decimal (`decimalString` nos validators do backend, que rejeita
 * vírgula). Todo valor digitado pelo usuário passa por `parseDecimal` antes de ir
 * para o payload; nada aqui deve ser usado para montar XML.
 *
 * Os valores chegam da API como string (Postgres `numeric` → "20.00"), por isso
 * as funções aceitam string | number e devolvem string pronta para render.
 */

/** Converte o valor cru (string da API ou number) em number; null quando inválido. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

interface DecimalOptions {
  /** Casas decimais mínimas (default 2). */
  min?: number;
  /** Casas decimais máximas (default = min). */
  max?: number;
  /** Texto devolvido quando o valor é nulo/inválido (default '—'). */
  fallback?: string;
}

/** "1234.5" → "1.234,50". Base de todas as outras formatações. */
export function formatDecimal(
  value: string | number | null | undefined,
  { min = 2, max, fallback = '—' }: DecimalOptions = {},
): string {
  const n = toNumber(value);
  if (n === null) return fallback;
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max ?? min,
  });
}

/** "1234.5" → "R$ 1.234,50". Use onde o layout ainda não imprime o "R$" separado. */
export function formatMoney(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  const n = toNumber(value);
  if (n === null) return fallback;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Quantidade comercial: a NF-e admite até 4 casas, mas "10,0000" polui a tela —
 * mostramos só as casas que existem ("10", "1,5", "0,3333").
 */
export function formatQuantidade(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  return formatDecimal(value, { min: 0, max: 4, fallback });
}

/** Alíquotas e percentuais: "18.00" → "18%", "1.6667" → "1,6667%". */
export function formatPercent(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  const formatted = formatDecimal(value, { min: 0, max: 4, fallback });
  return formatted === fallback ? formatted : `${formatted}%`;
}

/**
 * Normaliza o que o usuário digitou para o formato que a API aceita (ponto decimal).
 * Tolera os dois padrões, porque o campo aceita ambos enquanto o time se acostuma:
 *   "1.234,56" → "1234.56"   "20,00" → "20.00"   "20.00" → "20.00"
 *
 * Havendo vírgula, ela é o separador decimal e os pontos são de milhar. Sem vírgula,
 * um único ponto continua sendo decimal (compatibilidade com o que já era digitado);
 * vários pontos só podem ser milhar ("1.234.567").
 */
export function parseDecimal(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  if (raw.includes(',')) return raw.replace(/\./g, '').replace(',', '.');
  if ((raw.match(/\./g)?.length ?? 0) > 1) return raw.replace(/\./g, '');
  return raw;
}

/**
 * Valor da API (ponto decimal) → texto do input no padrão brasileiro, SEM separador
 * de milhar: agrupamento dentro de um campo editável atrapalha a digitação.
 * "20.00" → "20,00".
 */
export function toDecimalInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace('.', ',');
}

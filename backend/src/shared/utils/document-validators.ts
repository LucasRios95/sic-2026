/**
 * Validação de CNPJ, CPF e GTIN com os dígitos verificadores conforme algoritmo oficial.
 * Aceitam entrada com ou sem máscara; o valor persistido é sempre só dígitos.
 */

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(cnpj.slice(0, 12), w1);
  const d2 = calcDigit(cnpj.slice(0, 12) + d1, w2);
  return cnpj.endsWith(`${d1}${d2}`);
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;

  const w1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(cpf.slice(0, 9), w1);
  const d2 = calcDigit(cpf.slice(0, 9) + d1, w2);
  return cpf.endsWith(`${d1}${d2}`);
}

/**
 * GTIN (EAN/UPC) — códigos de barras aceitos no cEAN/cEANTrib da NF-e.
 * O XSD só admite 8, 12, 13 ou 14 dígitos; a SEFAZ ainda confere o dígito verificador
 * GS1 (pesos 3,1,3,… a partir da direita, excluindo o próprio DV).
 */
export function isValidGtin(value: string): boolean {
  const gtin = normalizeDigits(value);
  if (![8, 12, 13, 14].includes(gtin.length)) return false;
  if (/^0+$/.test(gtin)) return false;

  const body = gtin.slice(0, -1);
  const sum = body
    .split('')
    .reverse()
    .reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 3 : 1), 0);
  const dv = (10 - (sum % 10)) % 10;
  return Number(gtin.slice(-1)) === dv;
}

function calcDigit(base: string, weights: number[]): number {
  const sum = base.split('').reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

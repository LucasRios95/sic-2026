/**
 * Validação de CNPJ e CPF com os dois dígitos verificadores conforme algoritmo oficial.
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

function calcDigit(base: string, weights: number[]): number {
  const sum = base.split('').reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

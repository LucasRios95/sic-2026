import { describe, expect, it } from 'vitest';

import { isValidCnpj, isValidCpf, normalizeDigits } from '@shared/utils/document-validators';

describe('isValidCnpj', () => {
  it('aceita CNPJ válido com e sem máscara', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita tamanho errado, repetição e DV inválido', () => {
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('11222333000100')).toBe(false);
  });
});

describe('isValidCpf', () => {
  it('aceita CPFs válidos com e sem máscara', () => {
    // CPFs gerados aleatoriamente apenas para teste (DV calculado).
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('rejeita tamanho errado, repetição e DV inválido', () => {
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('52998224700')).toBe(false);
  });
});

describe('normalizeDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(normalizeDigits('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeDigits(' 529.982.247-25 ')).toBe('52998224725');
  });
});

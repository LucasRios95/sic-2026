import { describe, expect, it } from 'vitest';

import {
  isValidCnpj,
  isValidCpf,
  isValidGtin,
  normalizeDigits,
} from '@shared/utils/document-validators';

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

describe('isValidGtin', () => {
  it('aceita GTIN-8, GTIN-12, GTIN-13 e GTIN-14 com DV correto', () => {
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('7891000315507')).toBe(true);
    expect(isValidGtin('17891000315504')).toBe(true);
  });

  it('rejeita tamanhos fora do XSD, zeros e DV inválido', () => {
    expect(isValidGtin('1234567890')).toBe(false); // 10 dígitos
    expect(isValidGtin('00000000')).toBe(false);
    expect(isValidGtin('7891000315508')).toBe(false);
  });
});

describe('normalizeDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(normalizeDigits('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeDigits(' 529.982.247-25 ')).toBe('52998224725');
  });
});

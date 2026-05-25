import { describe, expect, it } from 'vitest';

import {
  formatChaveAcesso,
  renderChaveAcessoBarcode,
  renderConsultaQrCode,
} from '@modules/NFe/infra/pdf/barcode';

describe('formatChaveAcesso', () => {
  it('formata 44 dígitos em 11 grupos de 4', () => {
    const chave = '35260611222333000181550010000000011000000017';
    expect(formatChaveAcesso(chave)).toBe(
      '3526 0611 2223 3300 0181 5500 1000 0000 0110 0000 0017',
    );
  });

  it('devolve original quando não tem 44 dígitos (passthrough robusto)', () => {
    expect(formatChaveAcesso('123')).toBe('123');
  });
});

describe('renderChaveAcessoBarcode', () => {
  it('rejeita chave com formato incorreto', async () => {
    await expect(renderChaveAcessoBarcode('123')).rejects.toThrow(/44 dígitos/);
  });

  it('gera PNG válido (header 89 50 4E 47) para chave válida', async () => {
    const png = await renderChaveAcessoBarcode('35260611222333000181550010000000011000000017');
    expect(png.length).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });
});

describe('renderConsultaQrCode', () => {
  it('gera PNG válido com a URL de consulta SEFAZ', async () => {
    const png = await renderConsultaQrCode('35260611222333000181550010000000011000000017');
    expect(png.length).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89); // PNG signature
  });
});

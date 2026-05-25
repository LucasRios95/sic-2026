import { describe, expect, it } from 'vitest';

import { ChaveAcesso } from '@modules/NFe/domain/ChaveAcesso';

describe('ChaveAcesso', () => {
  it('compõe chave de 44 dígitos com DV calculado', () => {
    const chave = ChaveAcesso.build({
      ufEmitente: 'SP',
      anoEmissao: 2026,
      mesEmissao: 6,
      cnpjEmitente: '11222333000181',
      modelo: '55',
      serie: 1,
      numero: 12345,
      tipoEmissao: 1,
      codigoNumerico: '12345678',
    });

    expect(chave.value).toHaveLength(44);
    expect(chave.value).toMatch(/^\d{44}$/);
    expect(ChaveAcesso.validate(chave.value)).toBe(true);
  });

  it('estrutura posicional bate com o MOC (cUF SP=35, AAMM=2606, CNPJ, modelo, série, número)', () => {
    const chave = ChaveAcesso.build({
      ufEmitente: 'SP',
      anoEmissao: 2026,
      mesEmissao: 6,
      cnpjEmitente: '11.222.333/0001-81', // aceita com máscara
      modelo: '55',
      serie: 1,
      numero: 12345,
      tipoEmissao: 1,
      codigoNumerico: '12345678',
    });

    expect(chave.value.slice(0, 2)).toBe('35'); // SP
    expect(chave.value.slice(2, 6)).toBe('2606'); // AAMM
    expect(chave.value.slice(6, 20)).toBe('11222333000181'); // CNPJ sem máscara
    expect(chave.value.slice(20, 22)).toBe('55'); // modelo
    expect(chave.value.slice(22, 25)).toBe('001'); // série padded
    expect(chave.value.slice(25, 34)).toBe('000012345'); // número padded
    expect(chave.value.slice(34, 35)).toBe('1'); // tpEmis
    expect(chave.value.slice(35, 43)).toBe('12345678'); // cNF
  });

  it('rejeita UF desconhecida, CNPJ curto e cNF não-numérico', () => {
    expect(() =>
      ChaveAcesso.build({
        ufEmitente: 'XX',
        anoEmissao: 2026,
        mesEmissao: 6,
        cnpjEmitente: '11222333000181',
        modelo: '55',
        serie: 1,
        numero: 1,
        tipoEmissao: 1,
        codigoNumerico: '12345678',
      }),
    ).toThrow(/UF XX/);

    expect(() =>
      ChaveAcesso.build({
        ufEmitente: 'SP',
        anoEmissao: 2026,
        mesEmissao: 6,
        cnpjEmitente: '123',
        modelo: '55',
        serie: 1,
        numero: 1,
        tipoEmissao: 1,
        codigoNumerico: '12345678',
      }),
    ).toThrow(/CNPJ/);

    expect(() =>
      ChaveAcesso.build({
        ufEmitente: 'SP',
        anoEmissao: 2026,
        mesEmissao: 6,
        cnpjEmitente: '11222333000181',
        modelo: '55',
        serie: 1,
        numero: 1,
        tipoEmissao: 1,
        codigoNumerico: '1234567X',
      }),
    ).toThrow(/codigoNumerico/);
  });

  it('validate detecta DV incorreto', () => {
    const chave = ChaveAcesso.build({
      ufEmitente: 'SP',
      anoEmissao: 2026,
      mesEmissao: 6,
      cnpjEmitente: '11222333000181',
      modelo: '55',
      serie: 1,
      numero: 1,
      tipoEmissao: 1,
      codigoNumerico: '12345678',
    });
    // Inverte o último dígito (DV) — qualquer mudança produz validate=false.
    const last = Number(chave.value.slice(-1));
    const tampered = chave.value.slice(0, 43) + ((last + 1) % 10);
    expect(ChaveAcesso.validate(tampered)).toBe(false);
  });

  it('generateCodigoNumerico produz exatamente 8 dígitos', () => {
    for (let i = 0; i < 100; i++) {
      const code = ChaveAcesso.generateCodigoNumerico();
      expect(code).toMatch(/^\d{8}$/);
    }
  });
});

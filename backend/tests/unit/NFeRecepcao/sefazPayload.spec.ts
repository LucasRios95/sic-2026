import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { decodeDocZip, parseResumoNFe } from '@modules/NFeRecepcao/infra/sefaz/sefazPayload';

describe('decodeDocZip', () => {
  it('descompacta base64 + gzip de volta ao XML original', () => {
    const xml = '<resNFe><chNFe>35260611222333000181550010000000011000000017</chNFe></resNFe>';
    const base64Content = gzipSync(Buffer.from(xml, 'utf8')).toString('base64');

    const out = decodeDocZip({ nsu: '123', schema: 'resNFe', base64Content });
    expect(out.nsu).toBe('123');
    expect(out.schema).toBe('resNFe');
    expect(out.xml).toBe(xml);
  });

  it('falha graciosamente se o conteúdo não é gzip válido', () => {
    const base64Content = Buffer.from('plain text', 'utf8').toString('base64');
    expect(() => decodeDocZip({ nsu: '1', schema: 'x', base64Content })).toThrow();
  });
});

describe('parseResumoNFe', () => {
  const baseXml = (overrides: Partial<Record<string, string>> = {}): string => {
    const fields: Record<string, string> = {
      chNFe: '35260611222333000181550010000000011000000017',
      CNPJ: '11222333000181',
      xNome: 'EMITENTE EXEMPLO LTDA',
      dhEmi: '2026-05-20T10:15:00-03:00',
      vNF: '1500.75',
      ...overrides,
    };
    const inner = Object.entries(fields)
      .map(([k, v]) => `<${k}>${v}</${k}>`)
      .join('');
    return `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">${inner}</resNFe>`;
  };

  it('extrai chave, CNPJ, nome e valor total', () => {
    const data = parseResumoNFe(baseXml());
    expect(data.chaveAcesso).toBe('35260611222333000181550010000000011000000017');
    expect(data.emitenteCnpj).toBe('11222333000181');
    expect(data.emitenteNome).toBe('EMITENTE EXEMPLO LTDA');
    expect(data.valorTotal).toBe('1500.75');
  });

  it('deriva UF do cUF embutido na chave (35 → SP)', () => {
    const data = parseResumoNFe(baseXml());
    expect(data.ufEmitente).toBe('SP');
  });

  it('deriva número e série da chave', () => {
    // posições 22-25 = série, 25-34 = número (zero-padded)
    const chave = '35260611222333000181550120000123456000000017';
    const data = parseResumoNFe(baseXml({ chNFe: chave }));
    expect(data.serie).toBe('12');
    expect(data.numero).toBe('123456');
  });

  it('rejeita resumo sem chNFe válida', () => {
    const xml = '<resNFe><CNPJ>11222333000181</CNPJ></resNFe>';
    expect(() => parseResumoNFe(xml)).toThrow(/chave de acesso/);
  });

  it('limpa máscara de CNPJ (.,/-) se vier formatado', () => {
    const data = parseResumoNFe(baseXml({ CNPJ: '11.222.333/0001-81' }));
    expect(data.emitenteCnpj).toBe('11222333000181');
  });

  it('parseia dhEmi como Date', () => {
    const data = parseResumoNFe(baseXml({ dhEmi: '2026-05-20T10:15:00-03:00' }));
    expect(data.dhEmissao).toBeInstanceOf(Date);
    expect(data.dhEmissao.toISOString()).toBe('2026-05-20T13:15:00.000Z');
  });
});

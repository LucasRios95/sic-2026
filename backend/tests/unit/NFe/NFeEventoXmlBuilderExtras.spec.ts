import { describe, expect, it } from 'vitest';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { NFeEventoXmlBuilder } from '@modules/NFe/domain/NFeEventoXmlBuilder';

describe('NFeEventoXmlBuilder.buildCartaCorrecao', () => {
  const builder = new NFeEventoXmlBuilder();
  const base = {
    chaveAcesso: '35260611222333000181550010000000011000000017',
    cnpjEmitente: '11222333000181',
    ambiente: AmbienteSefaz.HOMOLOGACAO,
    ufEmitente: 'SP',
    dhEvento: new Date('2026-06-15T12:00:00Z'),
  };

  it('gera evento CC-e com tpEvento 110110 e Id de 53 chars', () => {
    const { xml, eventoId } = builder.buildCartaCorrecao({
      ...base,
      nSeqEvento: 1,
      correcao: 'Correção do nome da transportadora',
    });
    expect(eventoId).toBe(`ID110110${base.chaveAcesso}01`);
    expect(eventoId).toHaveLength(53);
    expect(xml).toContain('<tpEvento>110110</tpEvento>');
    expect(xml).toContain('<descEvento>Carta de Correcao</descEvento>');
    expect(xml).toContain('<xCorrecao>Correção do nome da transportadora</xCorrecao>');
  });

  it('inclui texto literal de xCondUso exigido pelo MOC', () => {
    const { xml } = builder.buildCartaCorrecao({
      ...base,
      nSeqEvento: 1,
      correcao: '123456789012345',
    });
    expect(xml).toContain('A Carta de Correcao e disciplinada pelo paragrafo 1o-A');
    expect(xml).toContain('I - as variaveis que determinam o valor do imposto');
    expect(xml).toContain('III - a data de emissao ou de saida');
  });

  it('sequencial diferente gera Id diferente (para múltiplas CC-e)', () => {
    const seq1 = builder.buildCartaCorrecao({ ...base, nSeqEvento: 1, correcao: '0'.repeat(20) });
    const seq20 = builder.buildCartaCorrecao({ ...base, nSeqEvento: 20, correcao: '0'.repeat(20) });
    expect(seq1.eventoId.endsWith('01')).toBe(true);
    expect(seq20.eventoId.endsWith('20')).toBe(true);
  });
});

describe('NFeEventoXmlBuilder.buildInutilizacao', () => {
  const builder = new NFeEventoXmlBuilder();

  it('gera ID com 43 caracteres conforme MOC', () => {
    const { inutId, xml } = builder.buildInutilizacao({
      cnpjEmitente: '11222333000181',
      ambiente: AmbienteSefaz.HOMOLOGACAO,
      ufEmitente: 'SP',
      ano: 2026,
      modelo: '55',
      serie: 1,
      numeroInicial: 100,
      numeroFinal: 150,
      justificativa: 'Erro no sistema deixou faixa não usada',
    });
    expect(inutId).toHaveLength(43);
    expect(inutId).toMatch(/^ID/);
    expect(xml).toContain('<xServ>INUTILIZAR</xServ>');
    expect(xml).toContain('<cUF>35</cUF>');
    expect(xml).toContain('<ano>26</ano>');
    expect(xml).toContain('<CNPJ>11222333000181</CNPJ>');
    expect(xml).toContain('<mod>55</mod>');
    expect(xml).toContain('<serie>1</serie>');
    expect(xml).toContain('<nNFIni>100</nNFIni>');
    expect(xml).toContain('<nNFFin>150</nNFFin>');
  });

  it('rejeita faixa inversa (final < inicial)', () => {
    expect(() =>
      builder.buildInutilizacao({
        cnpjEmitente: '11222333000181',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        ufEmitente: 'SP',
        ano: 2026,
        modelo: '55',
        serie: 1,
        numeroInicial: 200,
        numeroFinal: 100,
        justificativa: 'Faixa inválida deve falhar antes de enviar',
      }),
    ).toThrow(/numeroFinal/);
  });

  it('rejeita justificativa curta', () => {
    expect(() =>
      builder.buildInutilizacao({
        cnpjEmitente: '11222333000181',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        ufEmitente: 'SP',
        ano: 2026,
        modelo: '55',
        serie: 1,
        numeroInicial: 1,
        numeroFinal: 1,
        justificativa: 'curta',
      }),
    ).toThrow(/15 caracteres/);
  });

  it('rejeita UF desconhecida', () => {
    expect(() =>
      builder.buildInutilizacao({
        cnpjEmitente: '11222333000181',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        ufEmitente: 'XX',
        ano: 2026,
        modelo: '55',
        serie: 1,
        numeroInicial: 1,
        numeroFinal: 1,
        justificativa: 'Justificativa válida com 15 chars+',
      }),
    ).toThrow(/UF XX/);
  });
});

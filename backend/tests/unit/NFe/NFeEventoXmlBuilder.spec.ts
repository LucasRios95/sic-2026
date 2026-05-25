import { describe, expect, it } from 'vitest';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { NFeEventoXmlBuilder } from '@modules/NFe/domain/NFeEventoXmlBuilder';

describe('NFeEventoXmlBuilder.buildCancelamento', () => {
  const builder = new NFeEventoXmlBuilder();

  it('gera evento com Id correto (53 caracteres: ID + tpEvento + chave + nSeqEvento)', () => {
    const chave = '35260611222333000181550010000000011000000017';
    const { xml, eventoId } = builder.buildCancelamento({
      chaveAcesso: chave,
      cnpjEmitente: '11222333000181',
      ambiente: AmbienteSefaz.HOMOLOGACAO,
      ufEmitente: 'SP',
      dhEvento: new Date('2026-06-15T12:00:00Z'),
      nSeqEvento: 1,
      nProt: '135260012345678',
      justificativa: 'Cancelamento por erro de digitação no destinatário',
    });

    expect(eventoId).toBe(`ID110111${chave}01`);
    expect(eventoId).toHaveLength(53);
    expect(xml).toContain(`<infEvento Id="${eventoId}">`);
    expect(xml).toContain('<tpEvento>110111</tpEvento>');
    expect(xml).toContain('<chNFe>' + chave + '</chNFe>');
    expect(xml).toContain('<CNPJ>11222333000181</CNPJ>');
    expect(xml).toContain('<cOrgao>35</cOrgao>'); // SP
    expect(xml).toContain('<tpAmb>2</tpAmb>'); // homologação
    expect(xml).toContain('<descEvento>Cancelamento</descEvento>');
    expect(xml).toContain('<nProt>135260012345678</nProt>');
    expect(xml).toContain('<xJust>Cancelamento por erro');
  });

  it('produção marca tpAmb = 1', () => {
    const { xml } = builder.buildCancelamento({
      chaveAcesso: '35260611222333000181550010000000011000000017',
      cnpjEmitente: '11222333000181',
      ambiente: AmbienteSefaz.PRODUCAO,
      ufEmitente: 'SP',
      dhEvento: new Date(),
      nSeqEvento: 1,
      nProt: '1',
      justificativa: '123456789012345',
    });
    expect(xml).toContain('<tpAmb>1</tpAmb>');
  });

  it('Id muda conforme nSeqEvento (para CC-e futura — até 20 sequências)', () => {
    const base = {
      chaveAcesso: '35260611222333000181550010000000011000000017',
      cnpjEmitente: '11222333000181',
      ambiente: AmbienteSefaz.HOMOLOGACAO,
      ufEmitente: 'SP',
      dhEvento: new Date(),
      nProt: '1',
      justificativa: '123456789012345',
    };
    const seq1 = builder.buildCancelamento({ ...base, nSeqEvento: 1 });
    const seq5 = builder.buildCancelamento({ ...base, nSeqEvento: 5 });
    expect(seq1.eventoId.endsWith('01')).toBe(true);
    expect(seq5.eventoId.endsWith('05')).toBe(true);
    expect(seq1.eventoId).not.toBe(seq5.eventoId);
  });
});

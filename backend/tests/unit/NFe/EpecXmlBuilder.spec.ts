import { describe, expect, it } from 'vitest';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { EpecXmlBuilder } from '@modules/NFe/domain/EpecXmlBuilder';

describe('EpecXmlBuilder', () => {
  const builder = new EpecXmlBuilder();
  const chave = '35260611222333000181550010000000011000000017';

  const baseInput = {
    chaveAcesso: chave,
    cnpjEmitente: '11222333000181',
    ambiente: AmbienteSefaz.HOMOLOGACAO,
    dhEvento: new Date('2026-05-20T12:00:00Z'),
    destinatario: {
      ufDestino: 'SP',
      cnpj: '99888777000166',
      ie: '123456789',
    },
    valores: { vNF: '1500.00', vICMS: '270.00', vST: '0.00' },
    tpNF: 1 as const,
    ieEmitente: '987654321',
  };

  it('gera evento com tpEvento 110140 e Id de 53 chars', () => {
    const { xml, eventoId } = builder.build(baseInput);
    expect(eventoId).toBe(`ID110140${chave}01`);
    expect(eventoId).toHaveLength(53);
    expect(xml).toContain('<tpEvento>110140</tpEvento>');
    expect(xml).toContain('<descEvento>EPEC</descEvento>');
  });

  it('cOrgao é sempre 91 (ambiente nacional) — não usa UF do emitente', () => {
    const { xml } = builder.build(baseInput);
    expect(xml).toContain('<cOrgao>91</cOrgao>');
    expect(xml).toContain('<cOrgaoAutor>91</cOrgaoAutor>');
  });

  it('inclui CNPJ do destinatário no detEvento.dest', () => {
    const { xml } = builder.build(baseInput);
    expect(xml).toContain('<CNPJ>99888777000166</CNPJ>');
    expect(xml).toContain('<UF>SP</UF>');
    expect(xml).toContain('<vNF>1500.00</vNF>');
    expect(xml).toContain('<vICMS>270.00</vICMS>');
    expect(xml).toContain('<vST>0.00</vST>');
  });

  it('aceita destinatário PF (CPF) — exclusivo com CNPJ', () => {
    const { xml } = builder.build({
      ...baseInput,
      destinatario: { ufDestino: 'SP', cpf: '12345678909', ie: null },
    });
    expect(xml).toContain('<CPF>12345678909</CPF>');
    expect(xml).not.toContain('<CNPJ>99888777000166</CNPJ>');
  });

  it('aceita destinatário estrangeiro (idEstrangeiro)', () => {
    const { xml } = builder.build({
      ...baseInput,
      destinatario: { ufDestino: 'EX', idEstrangeiro: 'A0001234' },
    });
    expect(xml).toContain('<idEstrangeiro>A0001234</idEstrangeiro>');
  });

  it('rejeita se nenhum identificador de destinatário for informado', () => {
    expect(() =>
      builder.build({
        ...baseInput,
        destinatario: { ufDestino: 'SP' },
      }),
    ).toThrow(/exatamente um identificador/);
  });

  it('rejeita se dois identificadores forem informados ao mesmo tempo', () => {
    expect(() =>
      builder.build({
        ...baseInput,
        destinatario: { ufDestino: 'SP', cnpj: '99888777000166', cpf: '12345678909' },
      }),
    ).toThrow(/exatamente um identificador/);
  });

  it('rejeita chave de acesso inválida (não 44 dígitos)', () => {
    expect(() => builder.build({ ...baseInput, chaveAcesso: '123' })).toThrow(/44/);
  });

  it('produção marca tpAmb=1', () => {
    const { xml } = builder.build({ ...baseInput, ambiente: AmbienteSefaz.PRODUCAO });
    expect(xml).toContain('<tpAmb>1</tpAmb>');
  });

  it('tpNF 0 (entrada) preservado no XML', () => {
    const { xml } = builder.build({ ...baseInput, tpNF: 0 });
    expect(xml).toContain('<tpNF>0</tpNF>');
  });

  it('nSeqEvento default = 1; pode ser sobrescrito', () => {
    const { eventoId } = builder.build({ ...baseInput, nSeqEvento: 3 });
    expect(eventoId.endsWith('03')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { ManifestacaoXmlBuilder } from '@modules/NFeRecepcao/domain/ManifestacaoXmlBuilder';
import { TipoManifestacao } from '@modules/NFeRecepcao/domain/nfe-recepcao-enums';

describe('ManifestacaoXmlBuilder', () => {
  const builder = new ManifestacaoXmlBuilder();
  const chave = '35260611222333000181550010000000011000000017';
  const baseInput = {
    chaveAcesso: chave,
    cnpjDestinatario: '99888777000166',
    ambiente: AmbienteSefaz.HOMOLOGACAO,
    dhEvento: new Date('2026-05-20T12:00:00Z'),
  };

  it('CIENCIA gera tpEvento 210210 e descEvento "Ciencia da Operacao"', () => {
    const { xml, eventoId } = builder.build({
      ...baseInput,
      tipo: TipoManifestacao.CIENCIA_OPERACAO,
    });
    expect(eventoId).toBe(`ID210210${chave}01`);
    expect(xml).toContain('<tpEvento>210210</tpEvento>');
    expect(xml).toContain('<descEvento>Ciencia da Operacao</descEvento>');
  });

  it('CONFIRMACAO gera tpEvento 210200 e descEvento "Confirmacao da Operacao"', () => {
    const { xml } = builder.build({
      ...baseInput,
      tipo: TipoManifestacao.CONFIRMACAO_OPERACAO,
    });
    expect(xml).toContain('<tpEvento>210200</tpEvento>');
    expect(xml).toContain('<descEvento>Confirmacao da Operacao</descEvento>');
  });

  it('DESCONHECIMENTO exige justificativa ≥ 15 chars e inclui xJust no XML', () => {
    expect(() =>
      builder.build({
        ...baseInput,
        tipo: TipoManifestacao.DESCONHECIMENTO_OPERACAO,
      }),
    ).toThrow(/justificativa/i);

    expect(() =>
      builder.build({
        ...baseInput,
        tipo: TipoManifestacao.DESCONHECIMENTO_OPERACAO,
        justificativa: 'curto',
      }),
    ).toThrow(/justificativa/i);

    const { xml } = builder.build({
      ...baseInput,
      tipo: TipoManifestacao.DESCONHECIMENTO_OPERACAO,
      justificativa: 'Nao reconheco esta operacao com nosso CNPJ',
    });
    expect(xml).toContain('<tpEvento>210220</tpEvento>');
    expect(xml).toContain('<xJust>Nao reconheco esta operacao com nosso CNPJ</xJust>');
  });

  it('OPERACAO_NAO_REALIZADA também exige xJust', () => {
    const { xml } = builder.build({
      ...baseInput,
      tipo: TipoManifestacao.OPERACAO_NAO_REALIZADA,
      justificativa: 'Mercadoria nao chegou no destinatario',
    });
    expect(xml).toContain('<tpEvento>210240</tpEvento>');
    expect(xml).toContain('<xJust>Mercadoria nao chegou no destinatario</xJust>');
  });

  it('cOrgao é sempre 91 (ambiente nacional), ignora UF do destinatário', () => {
    const { xml } = builder.build({
      ...baseInput,
      tipo: TipoManifestacao.CIENCIA_OPERACAO,
    });
    expect(xml).toContain('<cOrgao>91</cOrgao>');
  });

  it('homologação → tpAmb=2, produção → tpAmb=1', () => {
    const homo = builder.build({
      ...baseInput,
      tipo: TipoManifestacao.CIENCIA_OPERACAO,
    });
    expect(homo.xml).toContain('<tpAmb>2</tpAmb>');

    const prod = builder.build({
      ...baseInput,
      ambiente: AmbienteSefaz.PRODUCAO,
      tipo: TipoManifestacao.CIENCIA_OPERACAO,
    });
    expect(prod.xml).toContain('<tpAmb>1</tpAmb>');
  });

  it('chave de acesso inválida (não 44 dígitos) é rejeitada', () => {
    expect(() =>
      builder.build({
        ...baseInput,
        chaveAcesso: '123',
        tipo: TipoManifestacao.CIENCIA_OPERACAO,
      }),
    ).toThrow(/44 dígitos/);
  });

  it('CIENCIA com justificativa não inclui xJust (campo proibido nesse tipo)', () => {
    const { xml } = builder.build({
      ...baseInput,
      tipo: TipoManifestacao.CIENCIA_OPERACAO,
      justificativa: 'isto nao deveria aparecer no xml',
    });
    expect(xml).not.toContain('<xJust>');
  });

  it('versao do envelope e detEvento = 1.00', () => {
    const { xml } = builder.build({
      ...baseInput,
      tipo: TipoManifestacao.CIENCIA_OPERACAO,
    });
    expect(xml).toContain('versao="1.00"');
    expect(xml).toContain('<verEvento>1.00</verEvento>');
  });

  it('limpa máscara de CNPJ no campo CNPJ do evento', () => {
    const { xml } = builder.build({
      ...baseInput,
      cnpjDestinatario: '99.888.777/0001-66',
      tipo: TipoManifestacao.CIENCIA_OPERACAO,
    });
    expect(xml).toContain('<CNPJ>99888777000166</CNPJ>');
  });
});

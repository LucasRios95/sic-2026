import { describe, expect, it } from 'vitest';

import {
  AmbienteSefaz,
  CodigoRegimeTributario,
} from '@modules/Companies/infra/typeorm/entities/Company';
import { ChaveAcesso } from '@modules/NFe/domain/ChaveAcesso';
import { NFeDocument } from '@modules/NFe/domain/NFeDocument';
import {
  FinalidadeNFe,
  FormaEmissao,
  TipoOperacao,
} from '@modules/NFe/domain/nfe-enums';
import { NFeXmlBuilder } from '@modules/NFe/domain/NFeXmlBuilder';
import { CstIbsCbs, IndicadorIE, TipoPessoa } from '@shared/types/fiscal-enums';

function makeDoc(): NFeDocument {
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
  return {
    chaveAcesso: chave.value,
    identificacao: {
      numero: 1,
      serie: 1,
      modelo: '55',
      naturezaOperacao: 'Venda de Mercadoria',
      tipoOperacao: TipoOperacao.SAIDA,
      finalidade: FinalidadeNFe.NORMAL,
      formaEmissao: FormaEmissao.NORMAL,
      ambiente: AmbienteSefaz.HOMOLOGACAO,
      dhEmissao: new Date('2026-06-15T12:00:00Z'),
      codigoNumerico: '12345678',
      idDest: 1,
    },
    emitente: {
      cnpj: '11222333000181',
      razaoSocial: 'EMPRESA EMITENTE LTDA',
      ie: '111222333444',
      crt: CodigoRegimeTributario.REGIME_NORMAL,
      endereco: {
        logradouro: 'Rua Teste',
        numero: '100',
        bairro: 'Centro',
        codigoMunicipioIbge: '3550308',
        municipio: 'São Paulo',
        uf: 'SP',
        cep: '01001000',
      },
    },
    destinatario: {
      tipoPessoa: 'PJ',
      cnpjCpf: '99888777000166',
      nome: 'CLIENTE TESTE LTDA',
      indicadorIE: IndicadorIE.CONTRIBUINTE,
      consumidorFinal: false,
      endereco: {
        logradouro: 'Av. Brasil',
        numero: '200',
        bairro: 'Centro',
        codigoMunicipioIbge: '3304557',
        municipio: 'Rio de Janeiro',
        uf: 'RJ',
        cep: '20040020',
      },
    },
    itens: [
      {
        numero: 1,
        codigo: 'PROD001',
        descricao: 'Produto Teste',
        ncm: '12345678',
        cfop: '6102',
        unidadeComercial: 'UN',
        quantidadeComercial: '1.0000',
        valorUnitario: '100.0000000000',
        valorTotal: '100.00',
        unidadeTributavel: 'UN',
        quantidadeTributavel: '1.0000',
        valorUnitarioTrib: '100.0000000000',
        origem: 0,
        cstIcms: '00',
        modBC: 3,
        baseIcms: '100.00',
        aliqIcms: '12.0000',
        valorIcms: '12.00',
        cstPis: '01',
        basePis: '100.00',
        aliqPis: '1.6500',
        valorPis: '1.65',
        cstCofins: '01',
        baseCofins: '100.00',
        aliqCofins: '7.6000',
        valorCofins: '7.60',
        cstIbsCbs: CstIbsCbs.TRIBUTACAO_INTEGRAL,
        cClassTrib: '100000',
        baseIbsCbs: '100.00',
        aliqIbs: '0.1000',
        valorIbs: '0.10',
        aliqCbs: '0.9000',
        valorCbs: '0.90',
      },
    ],
    totais: {
      valorProdutos: '100.00',
      valorDesconto: '0.00',
      valorFrete: '0.00',
      valorSeguro: '0.00',
      valorOutros: '0.00',
      valorTotal: '100.00',
      baseIcms: '100.00',
      valorIcms: '12.00',
      valorIcmsDeson: '0.00',
      baseIcmsST: '0.00',
      valorIcmsST: '0.00',
      valorFCP: '0.00',
      valorFCPST: '0.00',
      valorFCPSTRet: '0.00',
      valorICMSUFDest: '0.00',
      valorICMSUFRemet: '0.00',
      valorFCPUFDest: '0.00',
      valorIpi: '0.00',
      valorPis: '1.65',
      valorCofins: '7.60',
      valorII: '0.00',
      valorTotTrib: '21.35',
      baseIbsCbs: '100.00',
      valorIbs: '0.10',
      valorCbs: '0.90',
      valorIs: '0.00',
    },
    transporte: { modalidadeFrete: 0 },
    pagamentos: [{ meio: '01', valor: '100.00' }],
  };
}

describe('NFeXmlBuilder', () => {
  const builder = new NFeXmlBuilder();

  it('gera XML com namespace e Id correto', () => {
    const doc = makeDoc();
    const xml = builder.build(doc);

    expect(xml).toContain('<NFe xmlns="http://www.portalfiscal.inf.br/nfe">');
    expect(xml).toContain(`<infNFe Id="NFe${doc.chaveAcesso}" versao="4.00">`);
    expect(xml).toContain('</NFe>');
  });

  it('inclui blocos ide/emit/dest/det/total/transp/pag', () => {
    const xml = builder.build(makeDoc());
    expect(xml).toContain('<ide>');
    expect(xml).toContain('<emit>');
    expect(xml).toContain('<dest>');
    expect(xml).toContain('<det nItem="1">');
    expect(xml).toContain('<total>');
    expect(xml).toContain('<transp>');
    expect(xml).toContain('<pag>');
  });

  it('renderiza CRT 3 para emitente do regime normal', () => {
    const xml = builder.build(makeDoc());
    expect(xml).toContain('<CRT>3</CRT>');
  });

  it('renderiza grupo ICMS00 com base, alíquota e valor', () => {
    const xml = builder.build(makeDoc());
    expect(xml).toContain('<ICMS00>');
    expect(xml).toContain('<CST>00</CST>');
    expect(xml).toContain('<vBC>100.00</vBC>');
    expect(xml).toContain('<pICMS>12.0000</pICMS>');
    expect(xml).toContain('<vICMS>12.00</vICMS>');
  });

  it('renderiza grupos IBSCBS (RT 2025.002) com estrutura aninhada oficial', () => {
    const xml = builder.build(makeDoc());
    expect(xml).toContain('<IBSCBS>');
    // CST sai como código numérico (000), não como o nome do enum.
    expect(xml).toContain('<CST>000</CST>');
    expect(xml).not.toContain('<CST>TRIBUTACAO_INTEGRAL</CST>');
    expect(xml).toContain('<cClassTrib>100000</cClassTrib>');
    // Estrutura aninhada: gIBSCBS → vBC, gIBSUF/gIBSMun, vIBS, gCBS.
    expect(xml).toContain('<gIBSCBS><vBC>100.00</vBC>');
    expect(xml).toContain('<gIBSUF><pIBSUF>0.1000</pIBSUF><vIBSUF>0.10</vIBSUF></gIBSUF>');
    expect(xml).toContain('<gIBSMun><pIBSMun>0.0000</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun>');
    expect(xml).toContain('<gCBS><pCBS>0.9000</pCBS><vCBS>0.90</vCBS></gCBS>');
    // A estrutura achatada antiga não deve mais existir.
    expect(xml).not.toContain('<pIBS>');
    // Totais IBSCBSTot com grupos gIBS/gCBS.
    expect(xml).toContain('<IBSCBSTot><vBCIBSCBS>100.00</vBCIBSCBS>');
    expect(xml).toContain('<vIBSUF>0.10</vIBSUF>');
    expect(xml).toContain('<vCredPresCondSus>0.00</vCredPresCondSus>');
  });

  it('rejeita chave de acesso com DV inválido', () => {
    const doc = makeDoc();
    doc.chaveAcesso = doc.chaveAcesso.slice(0, 43) + '0'; // força DV errado (assumindo que o original não era 0)
    if (ChaveAcesso.validate(doc.chaveAcesso)) {
      // Caso raro do DV original ser 0 — força mudança.
      doc.chaveAcesso = doc.chaveAcesso.slice(0, 43) + '1';
    }
    expect(() => builder.build(doc)).toThrow(/Chave de acesso inválida/);
  });

  it('omite grupos não preenchidos (sem FCP/DIFAL/ST se não há valores)', () => {
    const xml = builder.build(makeDoc());
    expect(xml).not.toContain('<ICMSUFDest>'); // operação SP→RJ B2B contribuinte sem DIFAL no doc
    expect(xml).not.toContain('<vBCST>'); // sem ST
  });

  it('renderiza PF com tag CPF e PJ com tag CNPJ', () => {
    const docPf = makeDoc();
    docPf.destinatario = {
      ...docPf.destinatario,
      tipoPessoa: 'PF',
      cnpjCpf: '52998224725',
    };
    const xmlPf = builder.build(docPf);
    expect(xmlPf).toContain('<CPF>52998224725</CPF>');
    expect(xmlPf).not.toContain('<CNPJ>52998224725</CNPJ>');

    const docPj = makeDoc();
    const xmlPj = builder.build(docPj);
    expect(xmlPj).toContain('<CNPJ>99888777000166</CNPJ>');
  });

  it('CSOSN do Simples vai em ICMSSN<N>', () => {
    const doc = makeDoc();
    doc.emitente.crt = CodigoRegimeTributario.SIMPLES_NACIONAL;
    doc.itens[0].cstIcms = undefined;
    doc.itens[0].csosnIcms = '102';
    const xml = builder.build(doc);
    expect(xml).toContain('<CRT>1</CRT>');
    expect(xml).toContain('<ICMSSN102>');
    expect(xml).toContain('<CSOSN>102</CSOSN>');
  });

  // Suprime tipo importado mas não usado diretamente nos testes (foi referenciado via DTO).
  void TipoPessoa;
});

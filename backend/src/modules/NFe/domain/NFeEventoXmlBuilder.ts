import { create } from 'xmlbuilder2';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';

import { TIPO_EVENTO_CODIGO, TipoEventoNFe, UF_CODIGO } from './nfe-enums';

/**
 * Builder do XML de eventos da NF-e (cancelamento, CC-e, manifestação, EPEC, etc.).
 * Cada tipo de evento tem um `detEvento` específico — esta classe centraliza a estrutura
 * comum (`infEvento` com chave, CNPJ, tpEvento, nSeqEvento, dhEvento) e delega o conteúdo
 * de `detEvento` para builders especializados por tipo.
 *
 * Versão da NT de eventos: 1.00 (consolidada). Cancelamento e CC-e seguem layout estável
 * desde 2012 (NF-e 3.10).
 */
export class NFeEventoXmlBuilder {
  private static readonly NS = 'http://www.portalfiscal.inf.br/nfe';

  /**
   * Compõe o XML de um evento de cancelamento. Identificador único do evento:
   * `ID = "ID" + tpEvento(6) + chaveAcesso(44) + nSeqEvento(2)` = 53 caracteres.
   */
  buildCancelamento(input: {
    chaveAcesso: string;
    cnpjEmitente: string;
    ambiente: AmbienteSefaz;
    ufEmitente: string;
    dhEvento: Date;
    nSeqEvento: number;
    nProt: string;
    justificativa: string;
  }): { xml: string; eventoId: string } {
    return this.buildEventoComum({
      tipo: TipoEventoNFe.CANCELAMENTO,
      versaoEvento: '1.00',
      descEvento: 'Cancelamento',
      chaveAcesso: input.chaveAcesso,
      cnpjEmitente: input.cnpjEmitente,
      ambiente: input.ambiente,
      ufEmitente: input.ufEmitente,
      dhEvento: input.dhEvento,
      nSeqEvento: input.nSeqEvento,
      campos: (detEvento) => {
        detEvento.ele('nProt').txt(input.nProt).up();
        detEvento.ele('xJust').txt(input.justificativa).up();
      },
    });
  }

  /**
   * Carta de Correção Eletrônica (CC-e). Permite corrigir CAMPOS NÃO-FISCAIS de uma NF-e
   * já autorizada — descrição livre, transporte, observações, dados do destinatário NÃO
   * fiscais. Não pode corrigir: valores monetários, CNPJ/CPF, base de cálculo, alíquotas
   * (essas exigem nota de ajuste ou substituição).
   *
   * `nSeqEvento` é importante: o MOC permite até 20 CC-e por NF-e, e VALE A ÚLTIMA. Por
   * isso o caller precisa carregar o sequencial seguinte (CountByTipo(nfeId, CARTA_CORRECAO) + 1).
   *
   * Texto fixo `xCondUso` exigido pela SEFAZ — repetido literalmente conforme MOC.
   */
  buildCartaCorrecao(input: {
    chaveAcesso: string;
    cnpjEmitente: string;
    ambiente: AmbienteSefaz;
    ufEmitente: string;
    dhEvento: Date;
    nSeqEvento: number;
    correcao: string;
  }): { xml: string; eventoId: string } {
    return this.buildEventoComum({
      tipo: TipoEventoNFe.CARTA_CORRECAO,
      versaoEvento: '1.00',
      descEvento: 'Carta de Correcao',
      chaveAcesso: input.chaveAcesso,
      cnpjEmitente: input.cnpjEmitente,
      ambiente: input.ambiente,
      ufEmitente: input.ufEmitente,
      dhEvento: input.dhEvento,
      nSeqEvento: input.nSeqEvento,
      campos: (detEvento) => {
        detEvento.ele('xCorrecao').txt(input.correcao).up();
        detEvento.ele('xCondUso').txt(CONDICOES_USO_CCE).up();
      },
    });
  }

  /**
   * Inutilização de faixa de numeração não usada. NÃO é um "evento" tecnicamente — é uma
   * mensagem separada (NFeInutilizacao4), com schema próprio. O ID aqui tem 41 chars:
   * `ID + cUF(2) + ano(2) + CNPJ(14) + modelo(2) + serie(3) + nNFIni(9) + nNFFin(9)`.
   */
  buildInutilizacao(input: {
    cnpjEmitente: string;
    ambiente: AmbienteSefaz;
    ufEmitente: string;
    ano: number; // últimos 2 dígitos
    modelo: string;
    serie: number;
    numeroInicial: number;
    numeroFinal: number;
    justificativa: string;
  }): { xml: string; inutId: string } {
    const cUF = UF_CODIGO[input.ufEmitente];
    if (!cUF) throw new Error(`UF ${input.ufEmitente} sem código IBGE`);
    if (input.numeroFinal < input.numeroInicial) {
      throw new Error('numeroFinal deve ser ≥ numeroInicial');
    }
    if (input.justificativa.trim().length < 15) {
      throw new Error('Justificativa exige no mínimo 15 caracteres');
    }

    const cnpj = input.cnpjEmitente.replace(/\D/g, '');
    const ano = String(input.ano).slice(-2);
    const inutId =
      'ID' +
      cUF +
      ano +
      cnpj +
      input.modelo +
      String(input.serie).padStart(3, '0') +
      String(input.numeroInicial).padStart(9, '0') +
      String(input.numeroFinal).padStart(9, '0');

    if (inutId.length !== 43) {
      throw new Error(`ID de inutilização deveria ter 43 chars, gerou ${inutId.length}`);
    }

    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('inutNFe', { xmlns: NFeEventoXmlBuilder.NS, versao: '4.00' });
    const infInut = root.ele('infInut', { Id: inutId });
    infInut.ele('tpAmb').txt(input.ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2').up();
    infInut.ele('xServ').txt('INUTILIZAR').up();
    infInut.ele('cUF').txt(cUF).up();
    infInut.ele('ano').txt(ano).up();
    infInut.ele('CNPJ').txt(cnpj).up();
    infInut.ele('mod').txt(input.modelo).up();
    infInut.ele('serie').txt(String(input.serie)).up();
    infInut.ele('nNFIni').txt(String(input.numeroInicial)).up();
    infInut.ele('nNFFin').txt(String(input.numeroFinal)).up();
    infInut.ele('xJust').txt(input.justificativa).up();

    return { xml: root.end({ prettyPrint: false }), inutId };
  }

  /**
   * Esqueleto compartilhado de Cancelamento e CC-e (estrutura idêntica de infEvento;
   * só muda o conteúdo do detEvento).
   */
  private buildEventoComum(input: {
    tipo: TipoEventoNFe;
    versaoEvento: string;
    descEvento: string;
    chaveAcesso: string;
    cnpjEmitente: string;
    ambiente: AmbienteSefaz;
    ufEmitente: string;
    dhEvento: Date;
    nSeqEvento: number;
    campos: (detEvento: ReturnType<ReturnType<typeof create>['ele']>) => void;
  }): { xml: string; eventoId: string } {
    const tpEvento = TIPO_EVENTO_CODIGO[input.tipo];
    const eventoId = `ID${tpEvento}${input.chaveAcesso}${String(input.nSeqEvento).padStart(2, '0')}`;

    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('evento', { xmlns: NFeEventoXmlBuilder.NS, versao: input.versaoEvento });
    const infEvento = root.ele('infEvento', { Id: eventoId });
    infEvento.ele('cOrgao').txt(UF_CODIGO[input.ufEmitente]).up();
    infEvento.ele('tpAmb').txt(input.ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2').up();
    infEvento.ele('CNPJ').txt(input.cnpjEmitente.replace(/\D/g, '')).up();
    infEvento.ele('chNFe').txt(input.chaveAcesso).up();
    infEvento.ele('dhEvento').txt(input.dhEvento.toISOString()).up();
    infEvento.ele('tpEvento').txt(tpEvento).up();
    infEvento.ele('nSeqEvento').txt(String(input.nSeqEvento)).up();
    infEvento.ele('verEvento').txt(input.versaoEvento).up();

    const detEvento = infEvento.ele('detEvento', { versao: input.versaoEvento });
    detEvento.ele('descEvento').txt(input.descEvento).up();
    input.campos(detEvento);

    return { xml: root.end({ prettyPrint: false }), eventoId };
  }
}

/**
 * Texto literal das condições de uso da CC-e, exigido pelo MOC dentro de `<xCondUso>`.
 * Qualquer alteração resulta em rejeição da SEFAZ — copiado do Manual de Orientação.
 */
const CONDICOES_USO_CCE =
  'A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 ' +
  'e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao ' +
  'esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, ' +
  'aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados ' +
  'cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.';

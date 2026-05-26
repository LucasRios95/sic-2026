import { create } from 'xmlbuilder2';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';

import { TIPO_EVENTO_CODIGO, TipoEventoNFe } from './nfe-enums';

/**
 * Builder do Evento Prévio de Emissão em Contingência (EPEC) — tpEvento 110140.
 *
 * Diferenças relevantes vs. cancelamento/CC-e:
 *  - `cOrgao` = 91 (ambiente nacional — único caminho aceito para EPEC).
 *  - `detEvento` carrega um RESUMO da NF-e: cNPJ/CPF do destinatário, UF dest, IE dest,
 *    valores totais (vNF, vICMS, vST). Isso permite à SEFAZ validar a integridade do
 *    evento sem ter o XML completo.
 *  - Após autorização do evento (cStat 135/136), a NF-e está "autorizada provisoriamente"
 *    com `tpEmis = 4`. Quando a SEFAZ normal voltar, o emissor PRECISA transmitir a NF-e
 *    autorizada via NFeAutorizacao4 (a chave permanece a mesma — só muda tpEmis se for
 *    reemitida normal; o caminho oficial é reprocessar a EPEC mantendo `tpEmis = 4`).
 *
 * Referência: NT 2014/004 (EPEC) + atualizações da NT 2016/002.
 */
export class EpecXmlBuilder {
  private static readonly NS = 'http://www.portalfiscal.inf.br/nfe';

  build(input: {
    chaveAcesso: string;
    cnpjEmitente: string;
    ambiente: AmbienteSefaz;
    dhEvento: Date;
    nSeqEvento?: number;
    /** Dados do destinatário para checagem cruzada da SEFAZ. */
    destinatario: {
      ufDestino: string;
      /** Para destinatário PJ — informar CNPJ; para PF — CPF; para EX — idEstrangeiro. */
      cnpj?: string | null;
      cpf?: string | null;
      idEstrangeiro?: string | null;
      ie?: string | null;
    };
    valores: {
      vNF: string;
      vICMS: string;
      vST: string;
    };
    /** Indicador de NF-e: 0 = entrada, 1 = saída (tpNF da NF-e original). */
    tpNF: 0 | 1;
    /** Inscrição estadual do EMITENTE — separado para deixar explícito. */
    ieEmitente: string;
  }): { xml: string; eventoId: string } {
    if (!/^\d{44}$/.test(input.chaveAcesso)) {
      throw new Error('Chave de acesso EPEC deve ter 44 dígitos');
    }
    const dest = input.destinatario;
    const idsPresentes = [dest.cnpj, dest.cpf, dest.idEstrangeiro].filter(
      (v) => v && v.trim().length > 0,
    );
    if (idsPresentes.length !== 1) {
      throw new Error(
        'EPEC: informar exatamente um identificador de destinatário (CNPJ ou CPF ou idEstrangeiro)',
      );
    }

    const nSeqEvento = input.nSeqEvento ?? 1;
    const tpEvento = TIPO_EVENTO_CODIGO[TipoEventoNFe.EPEC];
    const eventoId = `ID${tpEvento}${input.chaveAcesso}${String(nSeqEvento).padStart(2, '0')}`;

    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('evento', { xmlns: EpecXmlBuilder.NS, versao: '1.00' });
    const infEvento = root.ele('infEvento', { Id: eventoId });
    infEvento.ele('cOrgao').txt('91').up();
    infEvento.ele('tpAmb').txt(input.ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2').up();
    infEvento.ele('CNPJ').txt(input.cnpjEmitente.replace(/\D/g, '')).up();
    infEvento.ele('chNFe').txt(input.chaveAcesso).up();
    infEvento.ele('dhEvento').txt(input.dhEvento.toISOString()).up();
    infEvento.ele('tpEvento').txt(tpEvento).up();
    infEvento.ele('nSeqEvento').txt(String(nSeqEvento)).up();
    infEvento.ele('verEvento').txt('1.00').up();

    const detEvento = infEvento.ele('detEvento', { versao: '1.00' });
    detEvento.ele('descEvento').txt('EPEC').up();
    detEvento.ele('cOrgaoAutor').txt('91').up();
    detEvento.ele('tpAutor').txt('1').up(); // 1 = empresa emitente
    detEvento.ele('verAplic').txt('SIC2026').up();
    detEvento.ele('dhEmi').txt(input.dhEvento.toISOString()).up();
    detEvento.ele('tpNF').txt(String(input.tpNF)).up();
    detEvento.ele('IE').txt(input.ieEmitente).up();

    const destEle = detEvento.ele('dest');
    destEle.ele('UF').txt(dest.ufDestino).up();
    if (dest.cnpj) destEle.ele('CNPJ').txt(dest.cnpj.replace(/\D/g, '')).up();
    else if (dest.cpf) destEle.ele('CPF').txt(dest.cpf.replace(/\D/g, '')).up();
    else if (dest.idEstrangeiro) destEle.ele('idEstrangeiro').txt(dest.idEstrangeiro).up();
    if (dest.ie) destEle.ele('IE').txt(dest.ie).up();
    destEle.ele('vNF').txt(input.valores.vNF).up();
    destEle.ele('vICMS').txt(input.valores.vICMS).up();
    destEle.ele('vST').txt(input.valores.vST).up();

    return { xml: root.end({ prettyPrint: false }), eventoId };
  }
}

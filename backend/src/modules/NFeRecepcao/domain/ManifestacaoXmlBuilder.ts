import { create } from 'xmlbuilder2';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { UF_CODIGO } from '@modules/NFe/domain/nfe-enums';

import { TIPO_MANIFESTACAO_CODIGO, TipoManifestacao } from './nfe-recepcao-enums';

const REQUER_JUSTIFICATIVA = new Set<TipoManifestacao>([
  TipoManifestacao.DESCONHECIMENTO_OPERACAO,
  TipoManifestacao.OPERACAO_NAO_REALIZADA,
]);

/**
 * Builder de evento de Manifestação do Destinatário. Versão 1.00 do layout (estável
 * desde 2012, sem mudanças na Reforma).
 *
 * Diferenças importantes vs. eventos da NF-e emitida:
 *  - `cOrgao` é sempre 91 (ambiente nacional) — não usa a UF do destinatário.
 *  - `verEvento` = "1.00".
 *  - `descEvento` varia por tipo: "Ciencia da Operacao", "Confirmacao da Operacao",
 *    "Desconhecimento da Operacao", "Operacao nao Realizada".
 *  - `xJust` obrigatória apenas para DESCONHECIMENTO e OPERACAO_NAO_REALIZADA;
 *    proibida em CIENCIA e CONFIRMACAO.
 */
export class ManifestacaoXmlBuilder {
  build(input: {
    chaveAcesso: string;
    cnpjDestinatario: string;
    ambiente: AmbienteSefaz;
    tipo: TipoManifestacao;
    dhEvento: Date;
    justificativa?: string | null;
  }): { xml: string; eventoId: string } {
    if (!/^\d{44}$/.test(input.chaveAcesso)) {
      throw new Error('Chave de acesso para manifestação deve ter 44 dígitos');
    }
    if (REQUER_JUSTIFICATIVA.has(input.tipo)) {
      if (!input.justificativa || input.justificativa.trim().length < 15) {
        throw new Error(
          `Tipo ${input.tipo} exige justificativa de no mínimo 15 caracteres`,
        );
      }
    }

    const tpEvento = TIPO_MANIFESTACAO_CODIGO[input.tipo];
    const eventoId = `ID${tpEvento}${input.chaveAcesso}01`;
    const descEvento = DESCRICAO[input.tipo];
    const cnpj = input.cnpjDestinatario.replace(/\D/g, '');

    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('evento', { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '1.00' });
    const infEvento = root.ele('infEvento', { Id: eventoId });
    infEvento.ele('cOrgao').txt('91').up(); // ambiente nacional
    infEvento.ele('tpAmb').txt(input.ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2').up();
    infEvento.ele('CNPJ').txt(cnpj).up();
    infEvento.ele('chNFe').txt(input.chaveAcesso).up();
    infEvento.ele('dhEvento').txt(input.dhEvento.toISOString()).up();
    infEvento.ele('tpEvento').txt(tpEvento).up();
    infEvento.ele('nSeqEvento').txt('1').up();
    infEvento.ele('verEvento').txt('1.00').up();

    const detEvento = infEvento.ele('detEvento', { versao: '1.00' });
    detEvento.ele('descEvento').txt(descEvento).up();
    if (input.justificativa && REQUER_JUSTIFICATIVA.has(input.tipo)) {
      detEvento.ele('xJust').txt(input.justificativa).up();
    }

    return { xml: root.end({ prettyPrint: false }), eventoId };
  }
}

const DESCRICAO: Record<TipoManifestacao, string> = {
  [TipoManifestacao.CIENCIA_OPERACAO]: 'Ciencia da Operacao',
  [TipoManifestacao.CONFIRMACAO_OPERACAO]: 'Confirmacao da Operacao',
  [TipoManifestacao.DESCONHECIMENTO_OPERACAO]: 'Desconhecimento da Operacao',
  [TipoManifestacao.OPERACAO_NAO_REALIZADA]: 'Operacao nao Realizada',
};

// `UF_CODIGO` importado para referência (cOrgao 91 cobre todos); evita warning de import não usado.
void UF_CODIGO;

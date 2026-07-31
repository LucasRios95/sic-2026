import dayjs from 'dayjs';
import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { CertificateAccessor } from '@shared/container/providers/CertificateVault/CertificateAccessor';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';
import { logger } from '@shared/logger';

import {
  DocumentStatus,
  TipoEventoNFe,
  TIPO_EVENTO_CODIGO,
} from '../../domain/nfe-enums';
import { NFeEventoXmlBuilder } from '../../domain/NFeEventoXmlBuilder';
import { NFe } from '../../infra/typeorm/entities/NFe';
import { SefazSoapClient } from '../../infra/sefaz/SefazSoapClient';
import { NFeSigner } from '../../infra/signing/NFeSigner';
import { INFeEventoRepository } from '../../repositories/INFeEventoRepository';
import { INFeRepository } from '../../repositories/INFeRepository';

interface IRequest {
  companyId: string;
  nfeId: string;
  justificativa: string;
  certificateVaultRef: string;
  userId: string;
  /**
   * Cancelamento extemporâneo: libera o envio depois da janela padrão de 24h.
   * Quem decide se aceita é a SEFAZ da UF — ver comentário do prazo abaixo.
   */
  forcarForaPrazo?: boolean;
}

interface IResponse {
  nfe: NFe;
  cStat: string | null;
  xMotivo: string | null;
  /** true quando o evento foi transmitido fora da janela de 24h. */
  foraDoPrazo: boolean;
}

/** Janela padrão nacional de cancelamento, em horas, contada da autorização. */
const PRAZO_PADRAO_HORAS = 24;

/**
 * Cancelamento de NF-e (PRD NFE-05). Regras:
 *  - NF-e precisa estar AUTHORIZED.
 *  - Janela padrão: 24h após autorização. Fora dela o cancelamento só sai com
 *    `forcarForaPrazo` (extemporâneo) — quem homologa ou rejeita é a SEFAZ da UF.
 *  - Justificativa obrigatória, mínimo 15 caracteres (MOC).
 *  - Sequencial 1 (cancelamento é único — NFE não permite "recancelar").
 *
 * Quando aceito (cStat 135 ou 155): atualiza NFe.status = CANCELLED + grava NFeEvento +
 * dispara hooks de estorno (estoque, financeiro) — esses hooks são placeholders aqui,
 * implementados nas próximas fases junto com módulos Financeiro e Estoque.
 */
@injectable()
export class CancelarNFeUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,

    @inject('NFeEventoRepository')
    private readonly eventoRepository: INFeEventoRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject(NFeSigner)
    private readonly signer: NFeSigner,

    @inject(SefazSoapClient)
    private readonly soap: SefazSoapClient,

    @inject(CertificateAccessor)
    private readonly certAccessor: CertificateAccessor,

    @inject(AuditService)
    private readonly audit: AuditService,

    @inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    if (request.justificativa.trim().length < 15) {
      throw new ValidationError(
        'Justificativa deve ter pelo menos 15 caracteres (regra SEFAZ)',
        { field: 'justificativa' },
      );
    }

    const nfe = await this.nfeRepository.findById(request.companyId, request.nfeId);
    if (!nfe) throw new NotFoundError('NF-e não encontrada');
    if (nfe.status !== DocumentStatus.AUTHORIZED) {
      throw new BusinessRuleError(
        `NF-e em status ${nfe.status} — só pode cancelar AUTHORIZED`,
        'NFE_NOT_CANCELLABLE',
      );
    }
    if (!nfe.chaveAcesso || !nfe.protocoloAutorizacao || !nfe.dhAutorizacao) {
      throw new BusinessRuleError(
        'NF-e sem chave/protocolo de autorização registrados — inconsistência',
        'NFE_MISSING_AUTH_DATA',
      );
    }

    // Prazo: 24h após autorização. Passado isso o cancelamento vira "extemporâneo" —
    // várias UFs ainda o homologam (SEFAZ responde cStat 155, normalmente com multa por
    // descumprimento de obrigação acessória); as que não permitem rejeitam com cStat 501.
    // Como a regra varia por UF, não decidimos aqui: exigimos o opt-in explícito do
    // usuário (`forcarForaPrazo`) e deixamos a SEFAZ dar a palavra final. Se rejeitar,
    // a nota continua AUTHORIZED e o caminho é Nota de Devolução (PRD Fluxo Crítico 5).
    const horasDesdeAutorizacao = dayjs().diff(dayjs(nfe.dhAutorizacao), 'hour', true);
    const foraDoPrazo = horasDesdeAutorizacao > PRAZO_PADRAO_HORAS;
    if (foraDoPrazo && !request.forcarForaPrazo) {
      throw new BusinessRuleError(
        `Prazo padrão de cancelamento (${PRAZO_PADRAO_HORAS}h) excedido em ` +
          `${(horasDesdeAutorizacao - PRAZO_PADRAO_HORAS).toFixed(1)}h. ` +
          'É possível tentar o cancelamento extemporâneo (sujeito à legislação da UF e a multa), ' +
          'confirmando a ciência no formulário. Alternativas: CC-e para campos corrigíveis ou ' +
          'Nota de Devolução para reverter a operação.',
        'NFE_CANCELLATION_DEADLINE_EXCEEDED',
      );
    }
    if (foraDoPrazo) {
      logger.warn(
        { nfeId: nfe.id, horasDesdeAutorizacao: Number(horasDesdeAutorizacao.toFixed(1)) },
        'Cancelamento extemporâneo autorizado pelo usuário — enviando para a SEFAZ decidir',
      );
    }

    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    // Compõe evento + assina + transmite
    const builder = new NFeEventoXmlBuilder();
    const dhEvento = new Date();
    const { xml, eventoId } = builder.buildCancelamento({
      chaveAcesso: nfe.chaveAcesso,
      cnpjEmitente: company.cnpj,
      ambiente: nfe.ambiente,
      ufEmitente: company.uf,
      dhEvento,
      nSeqEvento: 1,
      nProt: nfe.protocoloAutorizacao,
      justificativa: request.justificativa,
    });

    // Persiste evento como PENDING ANTES de chamar SEFAZ — assim, se cair no meio,
    // temos rastro do que foi tentado. `createOrReplace` reaproveita a linha de uma
    // tentativa anterior (cancelamento rejeitado pode ser retransmitido): sem isso, a
    // 2ª tentativa violaria o índice único uq_nfe_eventos_scope e retornaria erro 500.
    const eventoRecord = await this.eventoRepository.createOrReplace({
      nfeId: nfe.id,
      tipoEvento: TipoEventoNFe.CANCELAMENTO,
      sequencial: 1,
      dhEvento,
      justificativa: request.justificativa,
      xmlEvento: xml,
      createdBy: request.userId,
    });

    const cert = await this.certAccessor.retrieve(request.companyId, request.certificateVaultRef);
    const signedXml = this.signer.sign(xml, cert.content, cert.password, eventoId);

    // Envelope envEvento — SEFAZ permite até 20 eventos por lote, mas aqui mandamos 1.
    const envEvento = [
      '<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">',
      '<idLote>1</idLote>',
      signedXml.replace(/^<\?xml[^>]+\?>\s*/, ''),
      '</envEvento>',
    ].join('');

    const result = await this.soap.call({
      companyId: company.id,
      uf: company.uf,
      ambiente: nfe.ambiente,
      service: 'NFeRecepcaoEvento4',
      bodyXml: envEvento,
      certificateVaultRef: request.certificateVaultRef,
      nfeId: nfe.id,
    });

    // cStat 135 = Evento registrado e vinculado a NF-e; 155 = Evento registrado fora do prazo.
    // (Vem do `retEvento/infEvento`, não do cStat do lote — ver SefazSoapClient.extractStatus.)
    let cStat = result.cStat;
    let xMotivo = result.xMotivo;
    let aceito = cStat === '135' || cStat === '155';

    // cStat 573 = "Rejeição: Duplicidade de Evento" — já existe cancelamento registrado
    // para esta chave. Acontece quando uma tentativa anterior foi homologada na SEFAZ mas
    // não foi registrada aqui (ex.: timeout, ou a leitura do cStat do lote que trocava
    // 135 por 128). Confirmamos a situação real na consulta antes de dar a nota como
    // cancelada — nunca cancelamos só pela suposição da duplicidade.
    if (!aceito && cStat === '573') {
      const situacao = await this.consultarSituacao(nfe, company.uf, request.certificateVaultRef);
      if (situacao.cStat === '101') {
        aceito = true;
        cStat = '135';
        xMotivo = 'Evento de cancelamento já registrado na SEFAZ (confirmado por consulta)';
        logger.warn(
          { nfeId: nfe.id },
          'Cancelamento duplicado (573) e nota consta CANCELADA na SEFAZ — sincronizando status local',
        );
      } else {
        logger.warn(
          { nfeId: nfe.id, situacaoCStat: situacao.cStat },
          'Cancelamento rejeitado por duplicidade (573), mas consulta não confirma cancelamento',
        );
      }
    }

    await this.eventoRepository.update(eventoRecord.id, {
      status: aceito ? DocumentStatus.AUTHORIZED : DocumentStatus.REJECTED,
      protocolo: aceito ? extractProtocoloEvento(result.responseXml) : null,
      cStat: cStat ?? null,
      xMotivo: xMotivo ?? null,
      xmlRetorno: result.responseXml,
    });

    let updated = nfe;
    if (aceito) {
      updated = await this.nfeRepository.update(nfe.id, {
        status: DocumentStatus.CANCELLED,
        dhCancelamento: dhEvento,
        nProtCancelamento: extractProtocoloEvento(result.responseXml),
      });
      logger.info({ nfeId: nfe.id, cStat }, 'NF-e cancelada com sucesso');
    } else {
      logger.warn({ nfeId: nfe.id, cStat, xMotivo }, 'Cancelamento rejeitado pela SEFAZ');
    }

    await this.audit.record({
      action: 'nfe.cancel',
      entityType: 'nfe',
      entityId: nfe.id,
      payload: {
        chaveAcesso: nfe.chaveAcesso,
        cStat,
        xMotivo,
        justificativa: request.justificativa,
        foraDoPrazo,
        horasDesdeAutorizacao: Number(horasDesdeAutorizacao.toFixed(1)),
      },
    });

    if (aceito) {
      await this.notifications.info({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.cancelled',
        title: `NF-e ${nfe.numero} cancelada`,
        message:
          cStat === '155'
            ? `Cancelamento homologado FORA DO PRAZO (cStat 155) — pode gerar multa por obrigação acessória.`
            : `Cancelamento registrado na SEFAZ (cStat ${cStat}).`,
        link: `/fiscal/nfe/${nfe.id}`,
      });
    } else {
      await this.notifications.warn({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.cancel.rejected',
        title: `Cancelamento rejeitado para NF-e ${nfe.numero}`,
        message: `cStat ${cStat}: ${xMotivo}`,
        link: `/fiscal/nfe/${nfe.id}`,
      });
    }

    return { nfe: updated, cStat: cStat ?? null, xMotivo: xMotivo ?? null, foraDoPrazo };
  }

  /**
   * Consulta a situação atual da NF-e na SEFAZ (NFeConsultaProtocolo4). Retorna o cStat
   * de situação: 100 autorizada, 101 cancelada, 217 não consta na base.
   * Falha de comunicação aqui não derruba o cancelamento — só deixa de confirmar.
   */
  private async consultarSituacao(
    nfe: NFe,
    uf: string,
    certificateVaultRef: string,
  ): Promise<{ cStat: string | null }> {
    const bodyXml = [
      '<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
      `<tpAmb>${nfe.ambiente === 'PRODUCAO' ? '1' : '2'}</tpAmb>`,
      '<xServ>CONSULTAR</xServ>',
      `<chNFe>${nfe.chaveAcesso}</chNFe>`,
      '</consSitNFe>',
    ].join('');

    try {
      const consulta = await this.soap.call({
        companyId: nfe.companyId,
        uf,
        ambiente: nfe.ambiente,
        service: 'NFeConsultaProtocolo4',
        bodyXml,
        certificateVaultRef,
        nfeId: nfe.id,
      });
      return { cStat: consulta.cStat ?? null };
    } catch (err) {
      logger.warn(
        { nfeId: nfe.id, err: (err as Error).message },
        'Falha ao consultar situação da NF-e após duplicidade de evento',
      );
      return { cStat: null };
    }
  }
}

function extractProtocoloEvento(responseXml: string): string | null {
  // No retEvento, o protocolo do evento vai em nProt dentro de infEvento.
  const match = responseXml.match(/<nProt>(\d+)<\/nProt>/);
  return match ? match[1] : null;
}

// Suprime warning de import não usado direto no top-level.
void TIPO_EVENTO_CODIGO;

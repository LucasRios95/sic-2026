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
}

interface IResponse {
  nfe: NFe;
  cStat: string | null;
  xMotivo: string | null;
}

/**
 * Cancelamento de NF-e (PRD NFE-05). Regras:
 *  - NF-e precisa estar AUTHORIZED.
 *  - Janela legal: 24h após autorização (algumas UFs aceitam até 7 dias mediante regime
 *    especial — checado caso a caso; aqui aplicamos a regra padrão).
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

    // Prazo: 24h após autorização. Fora do prazo, sugerimos CC-e ou nota de devolução
    // (PRD Fluxo Crítico 5) — não implementamos sugestão automática aqui, mas a mensagem
    // de erro orienta o usuário.
    const horasDesdeAutorizacao = dayjs().diff(dayjs(nfe.dhAutorizacao), 'hour', true);
    if (horasDesdeAutorizacao > 24) {
      throw new BusinessRuleError(
        `Prazo legal de cancelamento (24h) excedido em ${(horasDesdeAutorizacao - 24).toFixed(1)}h. ` +
          'Use Carta de Correção (CC-e) para campos corrigíveis ou Nota de Devolução para reverter a operação.',
        'NFE_CANCELLATION_DEADLINE_EXCEEDED',
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
    // temos rastro do que foi tentado.
    const eventoRecord = await this.eventoRepository.create({
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
    const cStat = result.cStat;
    const xMotivo = result.xMotivo;
    const aceito = cStat === '135' || cStat === '155';

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
      },
    });

    if (aceito) {
      await this.notifications.info({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.cancelled',
        title: `NF-e ${nfe.numero} cancelada`,
        message: `Cancelamento registrado na SEFAZ (cStat ${cStat}).`,
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

    return { nfe: updated, cStat: cStat ?? null, xMotivo: xMotivo ?? null };
  }
}

function extractProtocoloEvento(responseXml: string): string | null {
  // No retEvento, o protocolo do evento vai em nProt dentro de infEvento.
  const match = responseXml.match(/<nProt>(\d+)<\/nProt>/);
  return match ? match[1] : null;
}

// Suprime warning de import não usado direto no top-level.
void TIPO_EVENTO_CODIGO;

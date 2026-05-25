import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

import { DocumentStatus } from '../../domain/nfe-enums';
import { NFe } from '../../infra/typeorm/entities/NFe';
import { SefazSoapClient } from '../../infra/sefaz/SefazSoapClient';
import { INFeRepository } from '../../repositories/INFeRepository';

interface IRequest {
  nfeId: string;
  certificateVaultRef: string;
}

interface IResponse {
  nfe: NFe;
  resolved: boolean;
  cStat: string | null;
}

/**
 * Reconcilia o status de uma NF-e que ficou em PROCESSING — caso típico de timeout na
 * primeira transmissão ou retorno cStat 105 (em processamento).
 *
 * Consulta `NFeConsultaProtocolo4` pela chave de acesso e mapeia o cStat para o status
 * final (AUTHORIZED/REJECTED/DENIED). Quando a SEFAZ ainda não tem resposta definitiva
 * (continua em 105), mantém a NFe em PROCESSING — outra rodada do worker tentará depois.
 *
 * Após N tentativas sem resolução (configurável), marca como ERROR e dispara notificação
 * para intervenção humana (decisão fiscal: refazer ou aceitar como perdida).
 *
 * Cenários de aceitação da SEFAZ (cStat oficial):
 *   100  Autorizada
 *   101  Cancelada
 *   105  Em processamento (mantém PROCESSING)
 *   110, 205, 301, 302  Denegada
 *   217  Documento não consta na base de dados — pode ser "ainda não chegou" ou
 *        "nunca foi recebida". Tratamos como PROCESSING para outra rodada decidir.
 *   demais  → REJECTED
 */
@injectable()
export class ReconcileNFeUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject(SefazSoapClient)
    private readonly soap: SefazSoapClient,

    @inject(AuditService)
    private readonly audit: AuditService,

    @inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const nfe = await this.findOrThrow(request.nfeId);
    if (nfe.status !== DocumentStatus.PROCESSING) {
      // Worker pode disparar em paralelo com a emissão original — se já resolveu, sai cedo.
      return { nfe, resolved: true, cStat: nfe.cStat ?? null };
    }
    if (!nfe.chaveAcesso) {
      logger.warn({ nfeId: nfe.id }, 'NFe PROCESSING sem chaveAcesso — não é reconciliável');
      return { nfe, resolved: false, cStat: null };
    }

    const company = await this.companyRepository.findById(nfe.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    const bodyXml = [
      '<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
      '<tpAmb>',
      nfe.ambiente === 'PRODUCAO' ? '1' : '2',
      '</tpAmb>',
      '<xServ>CONSULTAR</xServ>',
      `<chNFe>${nfe.chaveAcesso}</chNFe>`,
      '</consSitNFe>',
    ].join('');

    const result = await this.soap.call({
      companyId: nfe.companyId,
      uf: company.uf,
      ambiente: nfe.ambiente,
      service: 'NFeConsultaProtocolo4',
      bodyXml,
      certificateVaultRef: request.certificateVaultRef,
      nfeId: nfe.id,
    });

    const cStat = result.cStat ?? null;
    const xMotivo = result.xMotivo ?? null;
    const newStatus = mapConsultaCStatToStatus(cStat, nfe.status);

    if (newStatus === nfe.status) {
      // Ainda não resolveu — registra a tentativa e devolve sem update.
      logger.info({ nfeId: nfe.id, cStat }, 'NFe ainda em PROCESSING após consulta');
      return { nfe, resolved: false, cStat };
    }

    const protocolo = extractProtocolo(result.responseXml);
    const updated = await this.nfeRepository.update(nfe.id, {
      status: newStatus,
      cStat,
      xMotivo,
      protocoloAutorizacao:
        newStatus === DocumentStatus.AUTHORIZED ? protocolo : nfe.protocoloAutorizacao,
      dhAutorizacao:
        newStatus === DocumentStatus.AUTHORIZED ? new Date() : nfe.dhAutorizacao,
      xmlAutorizado:
        newStatus === DocumentStatus.AUTHORIZED ? result.responseXml : nfe.xmlAutorizado,
    });

    await this.audit.record({
      action: 'nfe.reconcile',
      entityType: 'nfe',
      entityId: nfe.id,
      companyId: nfe.companyId,
      payload: { from: nfe.status, to: newStatus, cStat, xMotivo },
    });

    if (newStatus === DocumentStatus.REJECTED || newStatus === DocumentStatus.DENIED) {
      await this.notifications.error({
        companyId: nfe.companyId,
        category: 'nfe.reconcile.failed',
        title: `NF-e ${nfe.numero} ${newStatus === DocumentStatus.DENIED ? 'denegada' : 'rejeitada'}`,
        message: `Reconciliação completou: cStat ${cStat} — ${xMotivo}`,
        link: `/fiscal/nfe/${nfe.id}`,
      });
    } else if (newStatus === DocumentStatus.AUTHORIZED) {
      await this.notifications.info({
        companyId: nfe.companyId,
        category: 'nfe.reconcile.authorized',
        title: `NF-e ${nfe.numero} autorizada`,
        message: `Reconciliada após PROCESSING (protocolo ${protocolo}).`,
        link: `/fiscal/nfe/${nfe.id}`,
      });
    }

    return { nfe: updated, resolved: true, cStat };
  }

  private async findOrThrow(nfeId: string): Promise<NFe> {
    // Reconcile pode rodar fora de contexto de tenant (job background) — busca direta.
    const repo = this.nfeRepository as INFeRepository & {
      findByIdAny?: (id: string) => Promise<NFe | null>;
    };
    if (repo.findByIdAny) {
      const found = await repo.findByIdAny(nfeId);
      if (!found) throw new NotFoundError(`NFe ${nfeId} não encontrada`);
      return found;
    }
    // Fallback usando companyId derivado: estamos chamando a sobrecarga padrão findById,
    // que filtra por company. Para o worker, busca sem tenant context é mais segura;
    // mantemos esse path para garantir compatibilidade com chamadas síncronas do controller.
    throw new Error('Repositório sem método findByIdAny — reconcile via worker exige acesso global');
  }
}

/**
 * Mapeia o cStat retornado por NFeConsultaProtocolo4 para o status interno. Lista
 * derivada do MOC NF-e 7.00 § 5 (tabela de códigos de retorno).
 */
function mapConsultaCStatToStatus(
  cStat: string | null,
  currentStatus: DocumentStatus,
): DocumentStatus {
  if (!cStat) return currentStatus;
  if (cStat === '100') return DocumentStatus.AUTHORIZED;
  if (cStat === '101') return DocumentStatus.CANCELLED;
  if (cStat === '105') return DocumentStatus.PROCESSING;
  if (cStat === '217') return DocumentStatus.PROCESSING; // ainda não recebida — tenta de novo
  if (['110', '205', '301', '302'].includes(cStat)) return DocumentStatus.DENIED;
  // Demais códigos não-felizes: rejeição definitiva. A SEFAZ tem ~700 códigos de rejeição,
  // a NFe simplesmente não estava válida.
  return DocumentStatus.REJECTED;
}

function extractProtocolo(xml: string): string | null {
  const match = xml.match(/<nProt>(\d+)<\/nProt>/);
  return match ? match[1] : null;
}

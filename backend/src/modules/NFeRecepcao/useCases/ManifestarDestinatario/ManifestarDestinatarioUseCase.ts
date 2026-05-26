import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { DocumentStatus } from '@modules/NFe/domain/nfe-enums';
import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';
import { NFeSigner } from '@modules/NFe/infra/signing/NFeSigner';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { ICertificateVault } from '@shared/container/providers/CertificateVault/ICertificateVault';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

import { ManifestacaoXmlBuilder } from '../../domain/ManifestacaoXmlBuilder';
import { TipoManifestacao } from '../../domain/nfe-recepcao-enums';
import { DfeManifestation } from '../../infra/typeorm/entities/DfeManifestation';
import { IDfeManifestationRepository } from '../../repositories/IDfeManifestationRepository';
import { IReceivedDocumentRepository } from '../../repositories/IReceivedDocumentRepository';

interface IRequest {
  companyId: string;
  receivedDocumentId: string;
  tipo: TipoManifestacao;
  justificativa?: string;
  certificateVaultRef: string;
  userId: string;
}

interface IResponse {
  manifestation: DfeManifestation;
  cStat: string | null;
  xMotivo: string | null;
  triggeredDownload: boolean;
}

const TIPOS_QUE_LIBERAM_XML_COMPLETO = new Set<TipoManifestacao>([
  TipoManifestacao.CONFIRMACAO_OPERACAO,
]);

/**
 * Manifesta o destinatário sobre um documento recebido (PRD ENT-03).
 *
 * Regras:
 *  - Documento precisa ter `chaveAcesso` (a SEFAZ exige).
 *  - Justificativa obrigatória para DESCONHECIMENTO e OPERACAO_NAO_REALIZADA (≥ 15 chars).
 *  - Após manifestar CONFIRMACAO_OPERACAO, a SEFAZ libera o `procNFe` (XML completo).
 *    Aqui registramos a manifestação e disparamos a flag `triggeredDownload` — o worker
 *    de reconciliação ou o operador pode buscar o XML completo via job dedicado depois.
 *
 * cStat de aceite: 135 (vinculada) ou 136 (vinculada sem efeito imediato). Demais = rejeitada.
 */
@injectable()
export class ManifestarDestinatarioUseCase {
  constructor(
    @inject('ReceivedDocumentRepository')
    private readonly documentRepository: IReceivedDocumentRepository,

    @inject('DfeManifestationRepository')
    private readonly manifestationRepository: IDfeManifestationRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject(NFeSigner)
    private readonly signer: NFeSigner,

    @inject(SefazSoapClient)
    private readonly soap: SefazSoapClient,

    @inject('CertificateVault')
    private readonly vault: ICertificateVault,

    @inject(AuditService)
    private readonly audit: AuditService,

    @inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const requerJust = [
      TipoManifestacao.DESCONHECIMENTO_OPERACAO,
      TipoManifestacao.OPERACAO_NAO_REALIZADA,
    ].includes(request.tipo);
    if (requerJust && (!request.justificativa || request.justificativa.trim().length < 15)) {
      throw new ValidationError(
        `Manifestação ${request.tipo} exige justificativa com no mínimo 15 caracteres`,
        { field: 'justificativa' },
      );
    }

    const document = await this.documentRepository.findById(
      request.companyId,
      request.receivedDocumentId,
    );
    if (!document) throw new NotFoundError('Documento recebido não encontrado');
    if (!document.chaveAcesso) {
      throw new BusinessRuleError(
        'Documento sem chave de acesso — não é possível manifestar via SEFAZ',
        'RECEIVED_DOC_MISSING_CHAVE',
      );
    }

    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    const builder = new ManifestacaoXmlBuilder();
    const dhEvento = new Date();
    const { xml, eventoId } = builder.build({
      chaveAcesso: document.chaveAcesso,
      cnpjDestinatario: company.cnpj,
      ambiente: company.ambienteSefaz,
      tipo: request.tipo,
      dhEvento,
      justificativa: request.justificativa,
    });

    // Persiste a manifestação como PENDING antes de transmitir (mesmo padrão de
    // CancelarNFe e EmitirCce — rastro mesmo em falha de rede).
    const record = await this.manifestationRepository.create({
      receivedDocumentId: document.id,
      tipo: request.tipo,
      dhEvento,
      justificativa: request.justificativa ?? null,
      createdBy: request.userId,
    });

    const cert = await this.vault.retrieve(request.certificateVaultRef);
    const signedXml = this.signer.sign(xml, cert.content, cert.password, eventoId);

    const envEvento = [
      '<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">',
      '<idLote>1</idLote>',
      signedXml.replace(/^<\?xml[^>]+\?>\s*/, ''),
      '</envEvento>',
    ].join('');

    const result = await this.soap.call({
      companyId: company.id,
      uf: company.uf,
      ambiente: company.ambienteSefaz,
      service: 'NFeRecepcaoEvento4',
      bodyXml: envEvento,
      certificateVaultRef: request.certificateVaultRef,
    });

    const aceito = result.cStat === '135' || result.cStat === '136';
    const updated = await this.manifestationRepository.update(record.id, {
      status: aceito ? DocumentStatus.AUTHORIZED : DocumentStatus.REJECTED,
      protocolo: aceito ? extractProtocolo(result.responseXml) : null,
      cStat: result.cStat ?? null,
      xMotivo: result.xMotivo ?? null,
      enviadoEm: new Date(),
      retornoXml: result.responseXml,
    });

    // Confirmação libera o XML completo via Distribuição DF-e. Marcamos a flag
    // para o worker buscar — não fazemos a chamada aqui (mantém latência baixa
    // do endpoint e o caller continua usando enquanto isso).
    const triggeredDownload = aceito && TIPOS_QUE_LIBERAM_XML_COMPLETO.has(request.tipo);

    await this.audit.record({
      action: 'recepcao.manifest',
      entityType: 'received_document',
      entityId: document.id,
      payload: {
        tipo: request.tipo,
        cStat: result.cStat,
        xMotivo: result.xMotivo,
        chaveAcesso: document.chaveAcesso,
      },
    });

    if (aceito) {
      await this.notifications.info({
        companyId: company.id,
        userId: request.userId,
        category: 'recepcao.manifested',
        title: `Manifestação ${request.tipo} aceita`,
        message: `NF-e do emitente ${document.emitenteNome} (${document.emitenteCnpj}) marcada.`,
        link: `/fiscal/recebidos/${document.id}`,
      });
    } else {
      await this.notifications.warn({
        companyId: company.id,
        userId: request.userId,
        category: 'recepcao.manifest.rejected',
        title: 'Manifestação rejeitada',
        message: `cStat ${result.cStat}: ${result.xMotivo}`,
        link: `/fiscal/recebidos/${document.id}`,
      });
    }

    return {
      manifestation: updated,
      cStat: result.cStat ?? null,
      xMotivo: result.xMotivo ?? null,
      triggeredDownload,
    };
  }
}

function extractProtocolo(xml: string): string | null {
  const match = xml.match(/<nProt>(\d+)<\/nProt>/);
  return match ? match[1] : null;
}

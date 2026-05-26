import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { CertificateAccessor } from '@shared/container/providers/CertificateVault/CertificateAccessor';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

import { DocumentStatus, TipoEventoNFe } from '../../domain/nfe-enums';
import { NFeEventoXmlBuilder } from '../../domain/NFeEventoXmlBuilder';
import { NFeEvento } from '../../infra/typeorm/entities/NFeEvento';
import { SefazSoapClient } from '../../infra/sefaz/SefazSoapClient';
import { NFeSigner } from '../../infra/signing/NFeSigner';
import { INFeEventoRepository } from '../../repositories/INFeEventoRepository';
import { INFeRepository } from '../../repositories/INFeRepository';

interface IRequest {
  companyId: string;
  nfeId: string;
  /** Texto da correção (15-1000 chars). NÃO pode mudar valores/CNPJ/datas. */
  correcao: string;
  certificateVaultRef: string;
  userId: string;
}

interface IResponse {
  evento: NFeEvento;
  sequencial: number;
  cStat: string | null;
  xMotivo: string | null;
}

/**
 * Carta de Correção Eletrônica — PRD NFE-05 / TSK-113.
 *
 * Regras:
 *  - NF-e precisa estar AUTHORIZED (não pode corrigir nota cancelada/rejeitada).
 *  - Máximo de 20 CC-e por NF-e (MOC). A última prevalece sobre as anteriores.
 *  - Texto de correção: mínimo 15 chars, máximo 1000 (limite do MOC).
 *  - Texto fixo `xCondUso` é colocado pelo builder — o caller não passa.
 *  - NÃO é permitido alterar via CC-e: valor/CNPJ-CPF/IE do destinatário, base de cálculo,
 *    alíquota, quantidade, valor da operação, data de emissão/saída. O caller é
 *    responsável por orientar o usuário (frontend deve mostrar essas restrições).
 *
 * cStat de aceite: 135 (Evento registrado e vinculado à NF-e). Outros = rejeitado;
 * o caller pode tentar de novo após corrigir.
 */
@injectable()
export class EmitirCceUseCase {
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
    const correcao = request.correcao.trim();
    if (correcao.length < 15) {
      throw new ValidationError(
        'Texto de correção exige no mínimo 15 caracteres (regra MOC)',
        { field: 'correcao' },
      );
    }
    if (correcao.length > 1000) {
      throw new ValidationError(
        'Texto de correção excede o limite MOC de 1000 caracteres',
        { field: 'correcao' },
      );
    }

    const nfe = await this.nfeRepository.findById(request.companyId, request.nfeId);
    if (!nfe) throw new NotFoundError('NF-e não encontrada');
    if (nfe.status !== DocumentStatus.AUTHORIZED) {
      throw new BusinessRuleError(
        `CC-e exige NF-e AUTHORIZED. Status atual: ${nfe.status}`,
        'NFE_NOT_AUTHORIZED_FOR_CCE',
      );
    }
    if (!nfe.chaveAcesso) {
      throw new BusinessRuleError('NF-e sem chave de acesso registrada', 'NFE_MISSING_CHAVE');
    }

    // Limite de 20 CC-e (MOC). O sequencial da nova é (count + 1).
    const cceCount = await this.eventoRepository.countByTipo(nfe.id, TipoEventoNFe.CARTA_CORRECAO);
    if (cceCount >= 20) {
      throw new BusinessRuleError(
        'Limite de 20 Cartas de Correção por NF-e atingido (regra MOC)',
        'CCE_LIMIT_REACHED',
      );
    }
    const nSeqEvento = cceCount + 1;

    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    const builder = new NFeEventoXmlBuilder();
    const dhEvento = new Date();
    const { xml, eventoId } = builder.buildCartaCorrecao({
      chaveAcesso: nfe.chaveAcesso,
      cnpjEmitente: company.cnpj,
      ambiente: nfe.ambiente,
      ufEmitente: company.uf,
      dhEvento,
      nSeqEvento,
      correcao,
    });

    // Persiste o evento ANTES de transmitir — assim, mesmo se a chamada SEFAZ cair no
    // meio, fica registrado que a CC-e número N foi tentada.
    const eventoRecord = await this.eventoRepository.create({
      nfeId: nfe.id,
      tipoEvento: TipoEventoNFe.CARTA_CORRECAO,
      sequencial: nSeqEvento,
      dhEvento,
      justificativa: correcao,
      xmlEvento: xml,
      createdBy: request.userId,
    });

    const cert = await this.certAccessor.retrieve(request.companyId, request.certificateVaultRef);
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
      ambiente: nfe.ambiente,
      service: 'NFeRecepcaoEvento4',
      bodyXml: envEvento,
      certificateVaultRef: request.certificateVaultRef,
      nfeId: nfe.id,
    });

    const aceito = result.cStat === '135' || result.cStat === '136';
    const updatedEvento = await this.eventoRepository.update(eventoRecord.id, {
      status: aceito ? DocumentStatus.AUTHORIZED : DocumentStatus.REJECTED,
      protocolo: aceito ? extractProtocoloEvento(result.responseXml) : null,
      cStat: result.cStat ?? null,
      xMotivo: result.xMotivo ?? null,
      xmlRetorno: result.responseXml,
    });

    await this.audit.record({
      action: 'nfe.cce',
      entityType: 'nfe',
      entityId: nfe.id,
      payload: {
        chaveAcesso: nfe.chaveAcesso,
        nSeqEvento,
        cStat: result.cStat,
        correcao: correcao.slice(0, 200), // primeiros 200 chars no audit log
      },
    });

    if (aceito) {
      await this.notifications.info({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.cce.success',
        title: `CC-e ${nSeqEvento}/20 registrada para NF-e ${nfe.numero}`,
        message: `Carta de Correção aceita (${20 - nSeqEvento} restantes para esta NF-e).`,
        link: `/fiscal/nfe/${nfe.id}`,
      });
    } else {
      await this.notifications.warn({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.cce.rejected',
        title: `CC-e rejeitada para NF-e ${nfe.numero}`,
        message: `cStat ${result.cStat}: ${result.xMotivo}`,
        link: `/fiscal/nfe/${nfe.id}`,
      });
    }

    return {
      evento: updatedEvento,
      sequencial: nSeqEvento,
      cStat: result.cStat ?? null,
      xMotivo: result.xMotivo ?? null,
    };
  }
}

function extractProtocoloEvento(responseXml: string): string | null {
  const match = responseXml.match(/<nProt>(\d+)<\/nProt>/);
  return match ? match[1] : null;
}

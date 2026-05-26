import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { SefazHealthMonitorService } from '@modules/SefazHealth/SefazHealthMonitorService';
import { SefazHealthState } from '@modules/SefazHealth/domain/sefaz-health-enums';
import { ICertificateVault } from '@shared/container/providers/CertificateVault/ICertificateVault';
import { BusinessRuleError, NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

import { EpecXmlBuilder } from '../../domain/EpecXmlBuilder';
import {
  DocumentStatus,
  FormaEmissao,
  TipoEventoNFe,
  TipoOperacao,
} from '../../domain/nfe-enums';
import { SefazEndpoints } from '../../infra/sefaz/SefazEndpoints';
import { NFe } from '../../infra/typeorm/entities/NFe';
import { SefazSoapClient } from '../../infra/sefaz/SefazSoapClient';
import { NFeSigner } from '../../infra/signing/NFeSigner';
import { INFeEventoRepository } from '../../repositories/INFeEventoRepository';
import { INFeRepository } from '../../repositories/INFeRepository';

interface IRequest {
  companyId: string;
  nfeId: string;
  certificateVaultRef: string;
  userId: string;
}

interface IResponse {
  nfe: NFe;
  cStat: string | null;
  xMotivo: string | null;
  protocolo: string | null;
}

/**
 * Emite Evento Prévio de Emissão em Contingência (EPEC) para uma NF-e existente — TSK-115
 * do Plano.
 *
 * Pré-condições:
 *  - NF-e existe e está em status PENDING ou PROCESSING (não autorizada ainda).
 *  - Tanto a SEFAZ normal quanto a SVC apropriada estão em DOWN (validamos via monitor —
 *    EPEC NÃO deveria ser usado quando há canal normal disponível).
 *  - Operador é um humano com permissão `nfe.contingencia.epec` ou `admin.full`.
 *
 * Após aceite (cStat 135/136):
 *  - NF-e migra para AUTHORIZED (provisorio) com `formaEmissao = CONTINGENCIA_EPEC`.
 *  - O `EpecReprocessWorker` (cron, futuro) tenta retransmitir NF-e EPEC quando a SEFAZ
 *    normal voltar — para "promover" a autorização provisoria à definitiva.
 *  - DANFE deve mostrar tarja "DANFE EMITIDO EM CONTINGÊNCIA EPEC".
 *
 * Sem aceite (rejeição): NF-e fica em REJECTED e o operador investiga.
 */
@injectable()
export class EmitirEpecUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,

    @inject('NFeEventoRepository')
    private readonly eventoRepository: INFeEventoRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,

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

    @inject(SefazHealthMonitorService)
    private readonly sefazHealth: SefazHealthMonitorService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const nfe = await this.nfeRepository.findById(request.companyId, request.nfeId);
    if (!nfe) throw new NotFoundError('NF-e não encontrada');
    if (![DocumentStatus.PENDING, DocumentStatus.PROCESSING].includes(nfe.status)) {
      throw new BusinessRuleError(
        `NF-e em status ${nfe.status} — EPEC só aplicável a PENDING/PROCESSING`,
        'NFE_NOT_EPEC_ELIGIBLE',
      );
    }
    if (!nfe.chaveAcesso) {
      throw new BusinessRuleError(
        'NF-e sem chave de acesso — composição da emissão original incompleta',
        'NFE_MISSING_CHAVE',
      );
    }
    if (!nfe.customerId) {
      throw new BusinessRuleError(
        'NF-e sem destinatário cadastrado — EPEC exige destinatário identificado',
        'NFE_MISSING_CUSTOMER',
      );
    }

    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    // Validação de pré-condição: precisamos que SEFAZ normal e SVC estejam DOWN para
    // legitimar EPEC. Se uma delas está UP, exigir uso do canal disponível (evita uso
    // indevido de contingência, que tem impacto fiscal/operacional).
    await this.exigirCanaisNormalEsvcIndisponiveis(company.uf, nfe.ambiente);

    const customer = await this.customerRepository.findById(company.id, nfe.customerId);
    if (!customer) throw new NotFoundError('Destinatário da NF-e não encontrado');

    const dhEvento = new Date();
    const tpNF = nfe.tipoOperacao === TipoOperacao.ENTRADA ? 0 : 1;

    const builder = new EpecXmlBuilder();
    const { xml, eventoId } = builder.build({
      chaveAcesso: nfe.chaveAcesso,
      cnpjEmitente: company.cnpj,
      ambiente: nfe.ambiente,
      dhEvento,
      destinatario: {
        ufDestino: customer.uf,
        cnpj: customer.tipoPessoa === 'PJ' ? customer.cnpjCpf : null,
        cpf: customer.tipoPessoa === 'PF' ? customer.cnpjCpf : null,
        idEstrangeiro:
          customer.tipoPessoa === 'ESTRANGEIRO' ? customer.cnpjCpf : null,
        ie: customer.ie ?? null,
      },
      valores: {
        vNF: nfe.valorTotal,
        vICMS: nfe.valorIcms,
        vST: nfe.valorIcmsST,
      },
      tpNF,
      ieEmitente: company.ie,
    });

    // Persiste evento como PENDING — rastro mesmo se a SEFAZ-AN nacional falhar.
    const eventoRecord = await this.eventoRepository.create({
      nfeId: nfe.id,
      tipoEvento: TipoEventoNFe.EPEC,
      sequencial: 1,
      dhEvento,
      justificativa: 'Contingência EPEC — SEFAZ normal e SVC indisponíveis',
      xmlEvento: xml,
      createdBy: request.userId,
    });

    const cert = await this.vault.retrieve(request.certificateVaultRef);
    const signedXml = this.signer.sign(xml, cert.content, cert.password, eventoId);

    // EPEC vai sempre para o ambiente nacional via NFeRecepcaoEvento4. SefazEndpoints
    // não tem rota dedicada — usamos a SVRS como entry point para o evento (caminho
    // suportado pelo MOC, item 5.6).
    const envEvento = [
      '<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">',
      '<idLote>1</idLote>',
      signedXml.replace(/^<\?xml[^>]+\?>\s*/, ''),
      '</envEvento>',
    ].join('');

    const result = await this.soap.call({
      companyId: company.id,
      uf: 'RS', // SVRS hospeda o serviço de eventos nacionais
      ambiente: nfe.ambiente,
      service: 'NFeRecepcaoEvento4',
      bodyXml: envEvento,
      certificateVaultRef: request.certificateVaultRef,
      nfeId: nfe.id,
    });

    const cStat = result.cStat ?? null;
    const xMotivo = result.xMotivo ?? null;
    const aceito = cStat === '135' || cStat === '136';
    const protocolo = aceito ? extractProtocolo(result.responseXml) : null;

    await this.eventoRepository.update(eventoRecord.id, {
      status: aceito ? DocumentStatus.AUTHORIZED : DocumentStatus.REJECTED,
      protocolo,
      cStat,
      xMotivo,
      xmlRetorno: result.responseXml,
    });

    let updated = nfe;
    if (aceito) {
      updated = await this.nfeRepository.update(nfe.id, {
        status: DocumentStatus.AUTHORIZED,
        formaEmissao: FormaEmissao.CONTINGENCIA_EPEC,
        protocoloAutorizacao: protocolo,
        dhAutorizacao: dhEvento,
        cStat,
        xMotivo,
        xmlAssinado: signedXml,
      });
      logger.info(
        { nfeId: nfe.id, cStat, protocolo },
        'EPEC aceito — NF-e autorizada provisoriamente em contingência',
      );
    } else {
      updated = await this.nfeRepository.update(nfe.id, {
        status: DocumentStatus.REJECTED,
        cStat,
        xMotivo,
      });
      logger.warn({ nfeId: nfe.id, cStat, xMotivo }, 'EPEC rejeitado pela SEFAZ');
    }

    await this.audit.record({
      action: 'nfe.epec',
      entityType: 'nfe',
      entityId: nfe.id,
      payload: {
        chaveAcesso: nfe.chaveAcesso,
        cStat,
        xMotivo,
        protocolo,
      },
    });

    if (aceito) {
      await this.notifications.warn({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.epec.authorized',
        title: `NF-e ${nfe.numero} autorizada via EPEC`,
        message:
          'Contingência ativa — DANFE deve sair com tarja EPEC. Quando SEFAZ voltar, ' +
          'o worker de reprocessamento promoverá para autorização definitiva.',
        link: `/fiscal/nfe/${nfe.id}`,
      });
    } else {
      await this.notifications.error({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.epec.rejected',
        title: `EPEC rejeitado para NF-e ${nfe.numero}`,
        message: `cStat ${cStat}: ${xMotivo}`,
        link: `/fiscal/nfe/${nfe.id}`,
      });
    }

    return { nfe: updated, cStat, xMotivo, protocolo };
  }

  /**
   * Bloqueia o uso de EPEC quando ainda há canal NORMAL ou SVC disponível. Isso evita
   * que operadores cliquem "EPEC" por hábito mesmo com SEFAZ funcionando — EPEC tem
   * implicações fiscais (a NF-e autorizada em contingência exige reprocessamento depois).
   */
  private async exigirCanaisNormalEsvcIndisponiveis(
    uf: string,
    ambiente: AmbienteSefaz,
  ): Promise<void> {
    const normal = await this.sefazHealth.getState(
      SefazEndpoints.autorizadoraDeUf(uf),
      ambiente,
    );
    const svc = await this.sefazHealth.getState(SefazEndpoints.svcDeUf(uf), ambiente);

    const algumDisponivel =
      normal.state !== SefazHealthState.DOWN || svc.state !== SefazHealthState.DOWN;
    if (algumDisponivel) {
      throw new BusinessRuleError(
        'EPEC só deve ser usado quando SEFAZ normal E SVC estão indisponíveis. ' +
          `Estado atual: normal=${normal.state}, svc=${svc.state}. Use emissão normal.`,
        'EPEC_NOT_NEEDED',
      );
    }
  }
}

function extractProtocolo(responseXml: string): string | null {
  const match = responseXml.match(/<nProt>(\d+)<\/nProt>/);
  return match ? match[1] : null;
}

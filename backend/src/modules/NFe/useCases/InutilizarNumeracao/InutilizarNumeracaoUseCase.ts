import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { CertificateAccessor } from '@shared/container/providers/CertificateVault/CertificateAccessor';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';
import { appDataSource } from '@shared/infra/typeorm/data-source';

import { NFeEventoXmlBuilder } from '../../domain/NFeEventoXmlBuilder';
import { SefazSoapClient } from '../../infra/sefaz/SefazSoapClient';
import { NFeSigner } from '../../infra/signing/NFeSigner';
import { NFe } from '../../infra/typeorm/entities/NFe';

interface IRequest {
  companyId: string;
  modelo: '55';
  serie: number;
  numeroInicial: number;
  numeroFinal: number;
  justificativa: string;
  ano?: number;
  certificateVaultRef: string;
  userId: string;
}

interface IResponse {
  inutId: string;
  protocolo: string | null;
  cStat: string | null;
  xMotivo: string | null;
  faixa: { inicial: number; final: number };
}

/**
 * Inutilização de faixa de numeração NÃO USADA. PRD NFE-05 / TSK-113.
 *
 * Quando usar: o emitente "queimou" números sem emitir (ex.: erro de configuração, falha
 * de sistema antes da transmissão, número reservado mas operação cancelada antes da
 * geração do XML). Sem inutilização, a SEFAZ vai reportar "lacunas" na escrituração.
 *
 * Pré-condições rigorosas:
 *  - Os números na faixa NÃO podem estar associados a nenhuma NFe persistida (status != DRAFT).
 *    Se algum número já está em uso, recusamos — inutilização exige faixa virgem.
 *  - Justificativa mínima 15 chars (regra SEFAZ).
 *  - numeroFinal >= numeroInicial.
 *
 * Pós-condições:
 *  - Faixa fica indisponível para emissão futura (SEFAZ rejeita).
 *  - Registramos a operação no AuditLog para rastreabilidade.
 */
@injectable()
export class InutilizarNumeracaoUseCase {
  constructor(
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
        'Justificativa exige no mínimo 15 caracteres (regra SEFAZ)',
        { field: 'justificativa' },
      );
    }
    if (request.numeroFinal < request.numeroInicial) {
      throw new ValidationError('numeroFinal deve ser ≥ numeroInicial', {
        field: 'numeroFinal',
      });
    }
    if (request.numeroFinal - request.numeroInicial > 1_000) {
      throw new ValidationError(
        'Faixa muito grande (> 1000 números). SEFAZ rejeita inutilizações em massa.',
        { field: 'numeroFinal' },
      );
    }

    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    // Verifica que NENHUM número da faixa está associado a uma NFe persistida (exceto DRAFT).
    // DRAFT = rascunho local, ainda não consumiu número junto à SEFAZ; pode ser descartado.
    const ocupados = await appDataSource
      .createQueryBuilder(NFe, 'n')
      .where('n.company_id = :companyId', { companyId: company.id })
      .andWhere('n.modelo = :modelo', { modelo: request.modelo })
      .andWhere('n.serie = :serie', { serie: request.serie })
      .andWhere('n.numero BETWEEN :ini AND :fim', {
        ini: String(request.numeroInicial),
        fim: String(request.numeroFinal),
      })
      .andWhere(`n.status != 'DRAFT'`)
      .getMany();

    if (ocupados.length > 0) {
      throw new BusinessRuleError(
        `Faixa contém ${ocupados.length} NF-e já emitida(s) — inutilize apenas números virgens. ` +
          `Use cancelamento ou nota de devolução para NF-e existentes.`,
        'INUTILIZATION_RANGE_OCCUPIED',
        {
          numeros: ocupados.map((n) => ({ id: n.id, numero: n.numero, status: n.status })),
        },
      );
    }

    const ano = request.ano ?? new Date().getUTCFullYear();
    const builder = new NFeEventoXmlBuilder();
    const { xml, inutId } = builder.buildInutilizacao({
      cnpjEmitente: company.cnpj,
      ambiente: company.ambienteSefaz,
      ufEmitente: company.uf,
      ano,
      modelo: request.modelo,
      serie: request.serie,
      numeroInicial: request.numeroInicial,
      numeroFinal: request.numeroFinal,
      justificativa: request.justificativa,
    });

    const cert = await this.certAccessor.retrieve(request.companyId, request.certificateVaultRef);
    const signedXml = this.signer.sign(xml, cert.content, cert.password, inutId);

    const result = await this.soap.call({
      companyId: company.id,
      uf: company.uf,
      ambiente: company.ambienteSefaz,
      service: 'NFeInutilizacao4',
      bodyXml: signedXml.replace(/^<\?xml[^>]+\?>\s*/, ''),
      certificateVaultRef: request.certificateVaultRef,
    });

    const aceito = result.cStat === '102'; // cStat 102 = Inutilização homologada
    const protocolo = aceito ? extractProtocolo(result.responseXml) : null;

    await this.audit.record({
      action: 'nfe.inutilization',
      entityType: 'numbering_series',
      entityId: null,
      companyId: company.id,
      payload: {
        modelo: request.modelo,
        serie: request.serie,
        numeroInicial: request.numeroInicial,
        numeroFinal: request.numeroFinal,
        ano,
        cStat: result.cStat,
        protocolo,
        justificativa: request.justificativa,
      },
    });

    if (aceito) {
      await this.notifications.info({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.inutilization.success',
        title: `Faixa ${request.numeroInicial}-${request.numeroFinal} inutilizada`,
        message: `Inutilização homologada pela SEFAZ (protocolo ${protocolo}).`,
      });
    } else {
      await this.notifications.warn({
        companyId: company.id,
        userId: request.userId,
        category: 'nfe.inutilization.rejected',
        title: `Inutilização rejeitada`,
        message: `cStat ${result.cStat}: ${result.xMotivo}`,
      });
    }

    return {
      inutId,
      protocolo,
      cStat: result.cStat ?? null,
      xMotivo: result.xMotivo ?? null,
      faixa: { inicial: request.numeroInicial, final: request.numeroFinal },
    };
  }
}

function extractProtocolo(xml: string): string | null {
  const match = xml.match(/<nProt>(\d+)<\/nProt>/);
  return match ? match[1] : null;
}

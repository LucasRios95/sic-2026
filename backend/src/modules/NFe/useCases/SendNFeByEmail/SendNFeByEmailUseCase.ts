import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { IDocumentStorage } from '@shared/container/providers/DocumentStorage/IDocumentStorage';
import { IMailProvider } from '@shared/container/providers/MailProvider/IMailProvider';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

import { DocumentStatus } from '../../domain/nfe-enums';
import { NFe } from '../../infra/typeorm/entities/NFe';
import { INFeRepository } from '../../repositories/INFeRepository';
import { GenerateDanfeUseCase } from '../GenerateDanfe/GenerateDanfeUseCase';

interface IRequest {
  companyId: string;
  nfeId: string;
  /** Quando ausente, usa Customer.email. Quando informado, sobrescreve (envio extra). */
  to?: string;
  userId: string;
}

interface IResponse {
  messageId: string;
  to: string;
  danfeUrl: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Envia XML autorizado + DANFE por e-mail para o destinatário. PRD NFE-02.
 *
 * Quando o `to` não é informado, usa `Customer.email` registrado. Quando nem isso
 * existe, recusa com mensagem orientada — o operador precisa preencher o cadastro
 * antes ou passar `to` explicitamente.
 *
 * Anexos: XML autorizado (XML) + DANFE (PDF). Os bytes do PDF vêm do `IDocumentStorage`
 * (gerado e cacheado pelo `GenerateDanfeUseCase`) — não re-renderizamos se já existe.
 */
@injectable()
export class SendNFeByEmailUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,

    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,

    @inject('DocumentStorage')
    private readonly storage: IDocumentStorage,

    @inject('MailProvider')
    private readonly mailer: IMailProvider,

    @inject(GenerateDanfeUseCase)
    private readonly generateDanfe: GenerateDanfeUseCase,

    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const nfe = await this.nfeRepository.findById(request.companyId, request.nfeId);
    if (!nfe) throw new NotFoundError('NF-e não encontrada');
    if (nfe.status !== DocumentStatus.AUTHORIZED) {
      throw new BusinessRuleError(
        `Envio por e-mail exige NF-e AUTHORIZED. Status atual: ${nfe.status}`,
        'NFE_NOT_AUTHORIZED_FOR_EMAIL',
      );
    }

    const to = await this.resolveRecipient(nfe, request);

    // Gera (ou recupera do cache) o DANFE PDF.
    const danfe = await this.generateDanfe.execute({
      companyId: request.companyId,
      nfeId: request.nfeId,
    });
    const pdfBytes = await this.storage.get(danfe.storageKey);
    if (!pdfBytes) {
      throw new BusinessRuleError(
        'DANFE foi gerado mas não foi encontrado no storage',
        'DANFE_STORAGE_INCONSISTENT',
      );
    }

    // XML autorizado vem direto da entidade — já está em `nfe.xmlAutorizado`. Quando
    // ausente (caso raro: NFe autorizada via reconciliação que não recuperou o XML
    // completo), enviamos só o PDF.
    const attachments = [
      {
        filename: `DANFE-${nfe.chaveAcesso}.pdf`,
        content: pdfBytes,
        contentType: 'application/pdf',
      },
    ];
    if (nfe.xmlAutorizado) {
      attachments.push({
        filename: `${nfe.chaveAcesso}.xml`,
        content: Buffer.from(nfe.xmlAutorizado, 'utf8'),
        contentType: 'application/xml',
      });
    }

    const subject = `NF-e ${String(nfe.numero).padStart(9, '0')} - Documento Fiscal`;
    const text = [
      `Olá,`,
      ``,
      `Segue em anexo a NF-e número ${nfe.numero}, série ${nfe.serie}.`,
      `Chave de acesso: ${nfe.chaveAcesso}`,
      `Protocolo de autorização: ${nfe.protocoloAutorizacao ?? 'N/A'}`,
      ``,
      `Para validar a autenticidade, consulte em https://www.nfe.fazenda.gov.br/portal/`,
      ``,
      `Esta é uma mensagem automática — não responda este e-mail.`,
    ].join('\n');

    const { messageId } = await this.mailer.send({
      to,
      subject,
      text,
      attachments,
    });

    await this.audit.record({
      action: 'nfe.email.send',
      entityType: 'nfe',
      entityId: nfe.id,
      payload: {
        to,
        messageId,
        chaveAcesso: nfe.chaveAcesso,
        attachmentsCount: attachments.length,
      },
    });

    return { messageId, to, danfeUrl: danfe.signedUrl };
  }

  private async resolveRecipient(nfe: NFe, request: IRequest): Promise<string> {
    const candidate = request.to?.trim();
    if (candidate) {
      if (!EMAIL_REGEX.test(candidate)) {
        throw new ValidationError('E-mail destinatário inválido', { field: 'to' });
      }
      return candidate;
    }
    if (!nfe.customerId) {
      throw new BusinessRuleError(
        'NF-e sem cliente vinculado e e-mail não informado — passe `to` no body',
        'EMAIL_RECIPIENT_MISSING',
      );
    }
    const customer = await this.customerRepository.findById(request.companyId, nfe.customerId);
    const customerEmail = customer?.email?.trim();
    if (!customerEmail || !EMAIL_REGEX.test(customerEmail)) {
      throw new BusinessRuleError(
        'Cliente sem e-mail válido cadastrado. Atualize o cadastro ou informe `to`.',
        'CUSTOMER_EMAIL_MISSING',
      );
    }
    return customerEmail;
  }
}

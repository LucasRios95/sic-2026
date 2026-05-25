import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { ICertificateVault } from '@shared/container/providers/CertificateVault/ICertificateVault';
import { BusinessRuleError, NotFoundError, ValidationError } from '@shared/errors';

import { CertificateInspector } from '../../domain/CertificateInspector';
import { Certificate } from '../../infra/typeorm/entities/Certificate';
import { ICertificateRepository } from '../../repositories/ICertificateRepository';

interface IRequest {
  companyId: string;
  /** Conteúdo PFX (PKCS#12) em base64. */
  pfxBase64: string;
  password: string;
  alias?: string;
  userId: string;
}

interface IResponse {
  certificate: Omit<Certificate, 'vaultRef'> & { vaultRef: string };
  expiresInDays: number;
}

/**
 * Upload de certificado A1 (PFX/PKCS#12). PRD CAD-01 / SEF-03.
 *
 * Fluxo:
 *  1. Decodifica base64 → Buffer.
 *  2. CertificateInspector lê o PFX para extrair subject, CNPJ, serial, thumbprint,
 *     validade. Senha errada já falha aqui.
 *  3. Confronta `cnpjTitular` com `Company.cnpj` — bloqueia upload cruzado.
 *  4. Recusa se já existe outro certificado com o mesmo thumbprint (single source of truth).
 *  5. Recusa se já expirou ou está fora da janela.
 *  6. Persiste no cofre (`ICertificateVault.store`) — recebe o `vaultRef` opaco.
 *  7. Persiste o registro de auditoria em `certificates`.
 *  8. AuditService + Notification (info se OK; warn se expira em < 60 dias).
 *
 * NÃO logamos nem propagamos a senha em nenhum lugar do pipeline.
 */
@injectable()
export class UploadCertificateUseCase {
  constructor(
    @inject('CertificateRepository')
    private readonly repo: ICertificateRepository,

    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('CertificateVault')
    private readonly vault: ICertificateVault,

    @inject(AuditService)
    private readonly audit: AuditService,

    @inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    if (request.password.length === 0) {
      throw new ValidationError('Senha do PFX é obrigatória', { field: 'password' });
    }

    let pkcs12: Buffer;
    try {
      pkcs12 = Buffer.from(request.pfxBase64, 'base64');
    } catch {
      throw new ValidationError('pfxBase64 inválido — não é base64', { field: 'pfxBase64' });
    }
    if (pkcs12.length < 100) {
      throw new ValidationError('PFX muito pequeno — provavelmente não é um certificado',
        { field: 'pfxBase64' });
    }

    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    const inspector = new CertificateInspector();
    let metadata;
    try {
      metadata = inspector.inspect(pkcs12, request.password, request.alias);
    } catch (err) {
      throw new ValidationError(
        'Não foi possível abrir o PFX. Verifique a senha e a integridade do arquivo.',
        { cause: (err as Error).message },
      );
    }

    // 1) Match CNPJ titular ↔ Company.cnpj
    if (metadata.cnpjTitular && metadata.cnpjTitular !== company.cnpj) {
      throw new BusinessRuleError(
        `CNPJ do certificado (${metadata.cnpjTitular}) não corresponde ao CNPJ da empresa (${company.cnpj})`,
        'CERTIFICATE_CNPJ_MISMATCH',
        { cnpjCert: metadata.cnpjTitular, cnpjEmpresa: company.cnpj },
      );
    }

    // 2) Validade
    const now = new Date();
    if (metadata.validTo <= now) {
      throw new BusinessRuleError(
        `Certificado expirou em ${metadata.validTo.toISOString()} — peça um novo à AC ICP-Brasil`,
        'CERTIFICATE_EXPIRED',
      );
    }
    if (metadata.validFrom > now) {
      throw new BusinessRuleError(
        `Certificado ainda não é válido (válido a partir de ${metadata.validFrom.toISOString()})`,
        'CERTIFICATE_NOT_YET_VALID',
      );
    }

    // 3) Duplicidade por thumbprint
    const existing = await this.repo.findByThumbprint(metadata.thumbprint);
    if (existing) {
      throw new BusinessRuleError(
        existing.companyId === company.id
          ? 'Este certificado já está cadastrado para esta empresa'
          : 'Este certificado já está cadastrado para outra empresa — não é permitido compartilhar PFX',
        'CERTIFICATE_DUPLICATE_THUMBPRINT',
      );
    }

    // 4) Persiste no cofre PRIMEIRO. Se falhar aqui, a tabela não fica suja.
    const stored = await this.vault.store({
      metadata: {
        alias: metadata.alias,
        type: metadata.tipo,
        subject: metadata.subject,
        serialNumber: metadata.serialNumber,
        thumbprint: metadata.thumbprint,
        validFrom: metadata.validFrom,
        validTo: metadata.validTo,
      },
      content: pkcs12,
      password: request.password,
    });

    // 5) Persiste o registro de auditoria
    const certificate = await this.repo.create({
      companyId: company.id,
      alias: metadata.alias,
      tipo: metadata.tipo,
      subject: metadata.subject,
      commonName: metadata.commonName,
      cnpjTitular: metadata.cnpjTitular,
      serialNumber: metadata.serialNumber,
      thumbprint: metadata.thumbprint,
      validFrom: metadata.validFrom,
      validTo: metadata.validTo,
      vaultRef: stored.vaultRef,
      createdBy: request.userId,
    });

    await this.audit.record({
      action: 'certificate.upload',
      entityType: 'certificate',
      entityId: certificate.id,
      payload: {
        alias: certificate.alias,
        thumbprint: certificate.thumbprint,
        validTo: certificate.validTo,
        cnpjTitular: certificate.cnpjTitular,
      },
    });

    const expiresInDays = Math.floor(
      (certificate.validTo.getTime() - now.getTime()) / 86_400_000,
    );

    if (expiresInDays <= 60) {
      // Avisa cedo — operação pode renovar com tranquilidade.
      await this.notifications.warn({
        companyId: company.id,
        userId: request.userId,
        category: 'certificate.uploaded.expiring-soon',
        title: `Certificado ${certificate.alias} expira em ${expiresInDays} dia(s)`,
        message: 'Renove com a AC antes do vencimento para evitar interrupção da emissão fiscal.',
      });
    } else {
      await this.notifications.info({
        companyId: company.id,
        userId: request.userId,
        category: 'certificate.uploaded',
        title: `Certificado ${certificate.alias} cadastrado`,
        message: `Válido até ${certificate.validTo.toLocaleDateString('pt-BR')} (${expiresInDays} dias).`,
      });
    }

    return { certificate, expiresInDays };
  }
}

import { container } from 'tsyringe';

import { IPermissionRepository } from '@modules/AccessControl/repositories/IPermissionRepository';
import { IRolePermissionRepository } from '@modules/AccessControl/repositories/IRolePermissionRepository';
import { IRoleRepository } from '@modules/AccessControl/repositories/IRoleRepository';
import { IUserRoleRepository } from '@modules/AccessControl/repositories/IUserRoleRepository';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import { ICertificateRepository } from '@modules/Certificates/repositories/ICertificateRepository';
import { ICfopRepository } from '@modules/Cfop/repositories/ICfopRepository';
import { INcmRepository } from '@modules/Ncm/repositories/INcmRepository';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { INFeEventoRepository } from '@modules/NFe/repositories/INFeEventoRepository';
import { INFeRepository } from '@modules/NFe/repositories/INFeRepository';
import { INumberingSeriesRepository } from '@modules/NFe/repositories/INumberingSeriesRepository';
import { ISefazTransmissionRepository } from '@modules/NFe/repositories/ISefazTransmissionRepository';
import { IDfeManifestationRepository } from '@modules/NFeRecepcao/repositories/IDfeManifestationRepository';
import { INsuCursorRepository } from '@modules/NFeRecepcao/repositories/INsuCursorRepository';
import { IReceivedDocumentRepository } from '@modules/NFeRecepcao/repositories/IReceivedDocumentRepository';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';
import { ISefazHealthStatusRepository } from '@modules/SefazHealth/repositories/ISefazHealthStatusRepository';
import { IProductRepository } from '@modules/Products/repositories/IProductRepository';
import { IProductTaxRuleRepository } from '@modules/Products/repositories/IProductTaxRuleRepository';
import { IServiceRepository } from '@modules/Services/repositories/IServiceRepository';
import { IServiceTaxRuleRepository } from '@modules/Services/repositories/IServiceTaxRuleRepository';
import { ISupplierRepository } from '@modules/Suppliers/repositories/ISupplierRepository';
import { IBeneficioFiscalUfRepository } from '@modules/TaxEngine/repositories/IBeneficioFiscalUfRepository';
import { IIcmsInternaUfRepository } from '@modules/TaxEngine/repositories/IIcmsInternaUfRepository';
import { IIcmsStMvaRepository } from '@modules/TaxEngine/repositories/IIcmsStMvaRepository';
import { IInterstateAliquotRepository } from '@modules/TaxEngine/repositories/IInterstateAliquotRepository';
import { ITaxParameterRepository } from '@modules/TaxEngine/repositories/ITaxParameterRepository';
import { ITenantRepository } from '@modules/Tenants/repositories/ITenantRepository';
import { IRefreshTokenRepository } from '@modules/Users/repositories/IRefreshTokenRepository';
import { IUserRepository } from '@modules/Users/repositories/IUserRepository';

import { PermissionRepository } from '@modules/AccessControl/infra/typeorm/repositories/PermissionRepository';
import { RolePermissionRepository } from '@modules/AccessControl/infra/typeorm/repositories/RolePermissionRepository';
import { RoleRepository } from '@modules/AccessControl/infra/typeorm/repositories/RoleRepository';
import { UserRoleRepository } from '@modules/AccessControl/infra/typeorm/repositories/UserRoleRepository';
import { AuditLogRepository } from '@modules/Auditoria/infra/typeorm/repositories/AuditLogRepository';
import { CertificateRepository } from '@modules/Certificates/infra/typeorm/repositories/CertificateRepository';
import { CfopRepository } from '@modules/Cfop/infra/typeorm/repositories/CfopRepository';
import { NcmRepository } from '@modules/Ncm/infra/typeorm/repositories/NcmRepository';
import { CompanyRepository } from '@modules/Companies/infra/typeorm/repositories/CompanyRepository';
import { CustomerRepository } from '@modules/Customers/infra/typeorm/repositories/CustomerRepository';
import { NFeEventoRepository } from '@modules/NFe/infra/typeorm/repositories/NFeEventoRepository';
import { NFeRepository } from '@modules/NFe/infra/typeorm/repositories/NFeRepository';
import { NumberingSeriesRepository } from '@modules/NFe/infra/typeorm/repositories/NumberingSeriesRepository';
import { SefazTransmissionRepository } from '@modules/NFe/infra/typeorm/repositories/SefazTransmissionRepository';
import { NFeSchemaValidator } from '@modules/NFe/infra/validation/NFeSchemaValidator';
import { DfeManifestationRepository } from '@modules/NFeRecepcao/infra/typeorm/repositories/DfeManifestationRepository';
import { NsuCursorRepository } from '@modules/NFeRecepcao/infra/typeorm/repositories/NsuCursorRepository';
import { ReceivedDocumentRepository } from '@modules/NFeRecepcao/infra/typeorm/repositories/ReceivedDocumentRepository';
import { NotificationRepository } from '@modules/Notifications/infra/typeorm/repositories/NotificationRepository';
import { SefazHealthStatusRepository } from '@modules/SefazHealth/infra/typeorm/repositories/SefazHealthStatusRepository';
import { ProductRepository } from '@modules/Products/infra/typeorm/repositories/ProductRepository';
import { ProductTaxRuleRepository } from '@modules/Products/infra/typeorm/repositories/ProductTaxRuleRepository';
import { ServiceRepository } from '@modules/Services/infra/typeorm/repositories/ServiceRepository';
import { ServiceTaxRuleRepository } from '@modules/Services/infra/typeorm/repositories/ServiceTaxRuleRepository';
import { SupplierRepository } from '@modules/Suppliers/infra/typeorm/repositories/SupplierRepository';
import { BeneficioFiscalUfRepository } from '@modules/TaxEngine/infra/typeorm/repositories/BeneficioFiscalUfRepository';
import { IcmsInternaUfRepository } from '@modules/TaxEngine/infra/typeorm/repositories/IcmsInternaUfRepository';
import { IcmsStMvaRepository } from '@modules/TaxEngine/infra/typeorm/repositories/IcmsStMvaRepository';
import { InterstateAliquotRepository } from '@modules/TaxEngine/infra/typeorm/repositories/InterstateAliquotRepository';
import { TaxParameterRepository } from '@modules/TaxEngine/infra/typeorm/repositories/TaxParameterRepository';
import { TenantRepository } from '@modules/Tenants/infra/typeorm/repositories/TenantRepository';
import { RefreshTokenRepository } from '@modules/Users/infra/typeorm/repositories/RefreshTokenRepository';
import { UserRepository } from '@modules/Users/infra/typeorm/repositories/UserRepository';

import { env } from '@config/env';

import { ICertificateVault } from './providers/CertificateVault/ICertificateVault';
import { FileSystemCertificateVault } from './providers/CertificateVault/implementations/FileSystemCertificateVault';
import { InMemoryCertificateVault } from './providers/CertificateVault/implementations/InMemoryCertificateVault';
import { IDocumentStorage } from './providers/DocumentStorage/IDocumentStorage';
import { FileSystemDocumentStorage } from './providers/DocumentStorage/implementations/FileSystemDocumentStorage';
import { IHashProvider } from './providers/HashProvider/IHashProvider';
import { BcryptHashProvider } from './providers/HashProvider/implementations/BcryptHashProvider';
import { IMailProvider } from './providers/MailProvider/IMailProvider';
import { LoggerMailProvider } from './providers/MailProvider/implementations/LoggerMailProvider';
import { SmtpMailProvider } from './providers/MailProvider/implementations/SmtpMailProvider';
import { IQueueProvider } from './providers/QueueProvider/IQueueProvider';
import { BullMqQueueProvider } from './providers/QueueProvider/implementations/BullMqQueueProvider';
import { ITokenProvider } from './providers/TokenProvider/ITokenProvider';
import { JwtTokenProvider } from './providers/TokenProvider/implementations/JwtTokenProvider';

/**
 * Registro central de dependências. Tokens são strings nomeadas (combina com o padrão
 * do projeto de referência); cada interface aponta para sua implementação concreta.
 * Para trocar de adapter (ex.: testes), basta reabrir o registro antes do container ser usado.
 */
export function registerDependencies(): void {
  // --- Multiempresa, RBAC e autenticação ---
  container.registerSingleton<ITenantRepository>('TenantRepository', TenantRepository);
  container.registerSingleton<ICompanyRepository>('CompanyRepository', CompanyRepository);
  container.registerSingleton<IUserRepository>('UserRepository', UserRepository);
  container.registerSingleton<IRefreshTokenRepository>(
    'RefreshTokenRepository',
    RefreshTokenRepository,
  );
  container.registerSingleton<IRoleRepository>('RoleRepository', RoleRepository);
  container.registerSingleton<IPermissionRepository>('PermissionRepository', PermissionRepository);
  container.registerSingleton<IUserRoleRepository>('UserRoleRepository', UserRoleRepository);
  container.registerSingleton<IRolePermissionRepository>(
    'RolePermissionRepository',
    RolePermissionRepository,
  );

  // --- Cadastros base (EP-03) ---
  container.registerSingleton<ICustomerRepository>('CustomerRepository', CustomerRepository);
  container.registerSingleton<ISupplierRepository>('SupplierRepository', SupplierRepository);
  container.registerSingleton<IProductRepository>('ProductRepository', ProductRepository);
  container.registerSingleton<IProductTaxRuleRepository>(
    'ProductTaxRuleRepository',
    ProductTaxRuleRepository,
  );
  container.registerSingleton<IServiceRepository>('ServiceRepository', ServiceRepository);
  container.registerSingleton<IServiceTaxRuleRepository>(
    'ServiceTaxRuleRepository',
    ServiceTaxRuleRepository,
  );

  // --- Motor tributário (EP-04) — tabelas globais ---
  container.registerSingleton<IInterstateAliquotRepository>(
    'InterstateAliquotRepository',
    InterstateAliquotRepository,
  );
  container.registerSingleton<IIcmsInternaUfRepository>(
    'IcmsInternaUfRepository',
    IcmsInternaUfRepository,
  );
  container.registerSingleton<IIcmsStMvaRepository>('IcmsStMvaRepository', IcmsStMvaRepository);
  container.registerSingleton<IBeneficioFiscalUfRepository>(
    'BeneficioFiscalUfRepository',
    BeneficioFiscalUfRepository,
  );
  container.registerSingleton<ITaxParameterRepository>(
    'TaxParameterRepository',
    TaxParameterRepository,
  );

  // --- Auditoria + Notificações (EP-05) ---
  container.registerSingleton<IAuditLogRepository>('AuditLogRepository', AuditLogRepository);
  container.registerSingleton<INotificationRepository>(
    'NotificationRepository',
    NotificationRepository,
  );

  // --- Certificados (EP-06b) ---
  container.registerSingleton<ICertificateRepository>(
    'CertificateRepository',
    CertificateRepository,
  );

  // --- Catálogo CFOP ---
  container.registerSingleton<ICfopRepository>('CfopRepository', CfopRepository);

  // --- Catálogo NCM (CAMEX) ---
  container.registerSingleton<INcmRepository>('NcmRepository', NcmRepository);

  // --- NF-e (Fase 1a — EP-06 + EP-07) ---
  container.registerSingleton<ISefazTransmissionRepository>(
    'SefazTransmissionRepository',
    SefazTransmissionRepository,
  );
  container.registerSingleton<INFeRepository>('NFeRepository', NFeRepository);
  container.registerSingleton<INFeEventoRepository>('NFeEventoRepository', NFeEventoRepository);
  container.registerSingleton<INumberingSeriesRepository>(
    'NumberingSeriesRepository',
    NumberingSeriesRepository,
  );
  // Validador XSD singleton — compila o schema oficial uma vez e cacheia pelo processo.
  container.registerSingleton(NFeSchemaValidator);

  // --- NF-e Recepção (Fase 1b — EP-10 + EP-11) ---
  container.registerSingleton<INsuCursorRepository>('NsuCursorRepository', NsuCursorRepository);
  container.registerSingleton<IReceivedDocumentRepository>(
    'ReceivedDocumentRepository',
    ReceivedDocumentRepository,
  );
  container.registerSingleton<IDfeManifestationRepository>(
    'DfeManifestationRepository',
    DfeManifestationRepository,
  );

  // --- Saúde SEFAZ (EP-06c) ---
  container.registerSingleton<ISefazHealthStatusRepository>(
    'SefazHealthStatusRepository',
    SefazHealthStatusRepository,
  );

  // --- Providers ---
  container.registerSingleton<IHashProvider>('HashProvider', BcryptHashProvider);
  container.registerSingleton<ITokenProvider>('TokenProvider', JwtTokenProvider);
  container.registerSingleton<IQueueProvider>('QueueProvider', BullMqQueueProvider);

  // Cofre de segredos: a escolha do adapter vem do env. Em testes, sobreescrever
  // chamando `container.register('CertificateVault', { useClass: InMemoryCertificateVault })`.
  if (env.VAULT_DRIVER === 'filesystem') {
    container.registerSingleton<ICertificateVault>(
      'CertificateVault',
      FileSystemCertificateVault,
    );
  } else {
    container.registerSingleton<ICertificateVault>(
      'CertificateVault',
      InMemoryCertificateVault,
    );
  }

  // --- Storage de documentos (EP-08) ---
  // Apenas FileSystem nesta versão; adapter S3 entra junto com produção.
  container.registerSingleton<IDocumentStorage>('DocumentStorage', FileSystemDocumentStorage);

  // --- Mailer (EP-08) ---
  // Sem MAIL_HOST configurado, usa LoggerMailProvider (apenas loga em dev).
  if (env.MAIL_HOST) {
    container.registerSingleton<IMailProvider>('MailProvider', SmtpMailProvider);
  } else {
    container.registerSingleton<IMailProvider>('MailProvider', LoggerMailProvider);
  }
}

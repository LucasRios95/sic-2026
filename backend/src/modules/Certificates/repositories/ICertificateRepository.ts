import { Certificate, CertificateType } from '../infra/typeorm/entities/Certificate';

export interface CreateCertificateData {
  companyId: string;
  alias: string;
  tipo: CertificateType;
  subject: string;
  commonName: string;
  cnpjTitular?: string | null;
  serialNumber: string;
  thumbprint: string;
  validFrom: Date;
  validTo: Date;
  vaultRef: string;
  createdBy?: string | null;
}

export interface ICertificateRepository {
  create(data: CreateCertificateData): Promise<Certificate>;
  findById(companyId: string, id: string): Promise<Certificate | null>;
  findByThumbprint(thumbprint: string): Promise<Certificate | null>;
  /** Retorna o certificado ativo com `valid_to` mais distante. Usado pelo resolver. */
  findActiveForCompany(companyId: string): Promise<Certificate | null>;
  /**
   * Cross-tenant: retorna QUALQUER certificado ativo (preferindo o mais distante de
   * expirar). Usado pelo `SefazHealthCheckWorker` para escolher uma identidade de
   * probe — a chamada `NFeStatusServico4` é leitura e não exige relação com o titular.
   */
  findFirstActive(): Promise<Certificate | null>;
  /** Lista todos (ativos e revogados) — para tela admin. */
  listByCompany(companyId: string): Promise<Certificate[]>;
  /**
   * Lista certificados ativos cujo `valid_to` está dentro de `daysAhead` (cross-tenant).
   * Usado pelo worker de alerta de expiração.
   */
  listExpiring(daysAhead: number): Promise<Certificate[]>;
  revoke(id: string, revokedBy: string): Promise<void>;
}

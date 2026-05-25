/**
 * Resolve o `vaultRef` do certificado A1 ATIVO de uma empresa. Abstrai o acesso à
 * tabela `certificates` (prevista no schema Prisma v1.3 mas ainda não modelada como
 * entidade TypeORM — pendência do EP-06b).
 *
 * Nesta versão, a implementação default lê de um mapa em memória configurável por
 * variável de ambiente, permitindo que o worker de reconciliação funcione enquanto
 * a tabela completa de certificados não está modelada. Em produção, será substituído
 * pela implementação que consulta `certificates WHERE company_id = ? AND active = true`.
 */
export interface IIntegrationCredentialResolver {
  resolveCertificateRef(companyId: string): Promise<string | null>;
}

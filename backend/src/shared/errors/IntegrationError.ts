import { AppError } from './AppError';

/**
 * Erro de integração com serviço externo (SEFAZ, Focus NF-e, cofre, banco).
 * Mantém o erro do provedor em `details` para auditoria; o status 502 indica
 * upstream com problema, não a aplicação.
 */
export class IntegrationError extends AppError {
  constructor(message: string, code = 'INTEGRATION_ERROR', details?: unknown) {
    super(message, code, 502, details);
  }
}

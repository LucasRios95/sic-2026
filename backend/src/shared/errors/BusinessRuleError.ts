import { AppError } from './AppError';

/**
 * Violação de regra de negócio. Operação sintaticamente válida mas semanticamente proibida
 * pelo domínio (ex.: tentar emitir NF-e sem certificado vigente; cancelar nota fora do prazo).
 */
export class BusinessRuleError extends AppError {
  constructor(message: string, code = 'BUSINESS_RULE', details?: unknown) {
    super(message, code, 409, details);
  }
}

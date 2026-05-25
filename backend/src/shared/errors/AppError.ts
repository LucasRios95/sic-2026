/**
 * Erro base do domínio. Toda exceção que é "esperada" e deve ser mapeada para HTTP
 * deve herdar desta classe. Erros inesperados (bugs, falhas de infra) ficam como Error nativo
 * e são tratados como 500 pelo middleware global.
 *
 * Estrutura do envelope HTTP gerado:
 *   { error: { code, message, details? }, requestId }
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

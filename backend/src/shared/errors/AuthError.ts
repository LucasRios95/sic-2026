import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado', details?: unknown) {
    super(message, 'UNAUTHORIZED', 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado', details?: unknown) {
    super(message, 'FORBIDDEN', 403, details);
  }
}

export class AccountLockedError extends AppError {
  constructor(message = 'Conta temporariamente bloqueada por excesso de tentativas', details?: unknown) {
    super(message, 'ACCOUNT_LOCKED', 423, details);
  }
}

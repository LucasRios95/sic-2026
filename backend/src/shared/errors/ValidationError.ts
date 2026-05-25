import { AppError } from './AppError';

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos', details?: unknown) {
    super(message, 'VALIDATION_ERROR', 422, details);
  }
}

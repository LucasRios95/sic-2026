import { AppError } from './AppError';

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado', details?: unknown) {
    super(message, 'NOT_FOUND', 404, details);
  }
}

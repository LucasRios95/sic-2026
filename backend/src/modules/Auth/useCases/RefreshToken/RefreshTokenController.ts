import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { RefreshTokenUseCase } from './RefreshTokenUseCase';

export class RefreshTokenController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(RefreshTokenUseCase);
    const result = await useCase.execute({
      refreshToken: request.body.refreshToken,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    });
    return response.json({ data: result });
  }
}

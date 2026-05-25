import { Request, Response } from 'express';

/**
 * Devolve o contexto do usuário autenticado. Útil para o frontend re-hidratar
 * o estado após reload (ler permissões/empresas acessíveis sem decodificar JWT).
 */
export class MeController {
  async handle(request: Request, response: Response): Promise<Response> {
    return response.json({ data: request.user });
  }
}

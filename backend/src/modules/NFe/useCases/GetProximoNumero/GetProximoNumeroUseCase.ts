import { inject, injectable } from 'tsyringe';

import { INumberingSeriesRepository } from '../../repositories/INumberingSeriesRepository';

interface IRequest {
  companyId: string;
  modelo: string;
  serie: number;
}

interface IResponse {
  modelo: string;
  serie: number;
  proximoNumero: string;
  /** Último número efetivamente alocado nesta série. `null` quando a série é nova. */
  ultimoUsado: string | null;
}

/**
 * Lê próximo + último usado da série SEM reservar. A UI usa o último usado
 * como referência informativa ("Último número emitido: 9211") — o faturista
 * digita manualmente o número da nota que vai emitir. Pré-popular não rolou bem
 * com numeração que pula buracos.
 */
@injectable()
export class GetProximoNumeroUseCase {
  constructor(
    @inject('NumberingSeriesRepository')
    private readonly numberingRepository: INumberingSeriesRepository,
  ) {}

  async execute({ companyId, modelo, serie }: IRequest): Promise<IResponse> {
    const info = await this.numberingRepository.peekSeriesInfo(
      companyId,
      modelo,
      serie,
    );
    return {
      modelo,
      serie,
      proximoNumero: info.proximoNumero,
      ultimoUsado: info.ultimoUsado,
    };
  }
}

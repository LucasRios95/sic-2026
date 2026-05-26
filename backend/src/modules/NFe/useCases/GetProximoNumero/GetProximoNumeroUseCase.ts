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
}

/**
 * Lê o próximo número da série SEM reservar. Usado pela UI de emissão para
 * pré-popular o campo "Número" no formulário — o faturista pode aceitar o
 * sugerido ou alterar pra alinhar com talão físico/escrituração.
 */
@injectable()
export class GetProximoNumeroUseCase {
  constructor(
    @inject('NumberingSeriesRepository')
    private readonly numberingRepository: INumberingSeriesRepository,
  ) {}

  async execute({ companyId, modelo, serie }: IRequest): Promise<IResponse> {
    const proximoNumero = await this.numberingRepository.peekProximoNumero(
      companyId,
      modelo,
      serie,
    );
    return { modelo, serie, proximoNumero };
  }
}

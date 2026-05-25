import { inject, injectable } from 'tsyringe';

import { NotFoundError, ValidationError } from '@shared/errors';

import { IUpdateServiceDTO } from '../../dtos/ServiceDTOs';
import { Service } from '../../infra/typeorm/entities/Service';
import { IServiceRepository } from '../../repositories/IServiceRepository';

interface IRequest {
  companyId: string;
  serviceId: string;
  data: IUpdateServiceDTO;
}

@injectable()
export class UpdateServiceUseCase {
  constructor(
    @inject('ServiceRepository')
    private readonly serviceRepository: IServiceRepository,
  ) {}

  async execute({ companyId, serviceId, data }: IRequest): Promise<Service> {
    const existing = await this.serviceRepository.findById(companyId, serviceId);
    if (!existing) throw new NotFoundError('Serviço não encontrado');

    if (data.itemListaServico && !/^\d{1,2}\.\d{2}(-\d{2})?$/.test(data.itemListaServico)) {
      throw new ValidationError(
        'itemListaServico deve seguir o formato "1.05" ou "17.05" da LC 116/2003',
        { field: 'itemListaServico' },
      );
    }

    return this.serviceRepository.update(serviceId, data);
  }
}

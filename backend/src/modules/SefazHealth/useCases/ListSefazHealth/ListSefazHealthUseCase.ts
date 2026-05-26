import { inject, injectable } from 'tsyringe';

import { SefazHealthMonitorService } from '../../SefazHealthMonitorService';
import { SefazHealthStatus } from '../../infra/typeorm/entities/SefazHealthStatus';

@injectable()
export class ListSefazHealthUseCase {
  constructor(
    @inject(SefazHealthMonitorService)
    private readonly monitor: SefazHealthMonitorService,
  ) {}

  async execute(): Promise<SefazHealthStatus[]> {
    return this.monitor.list();
  }
}

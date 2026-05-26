import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';

import { TaxParameter } from '../../infra/typeorm/entities/TaxParameter';
import { ITaxParameterRepository } from '../../repositories/ITaxParameterRepository';

interface IRequest {
  chave: string;
  valor: unknown;
  fonteNorma?: string | null;
  validFrom: Date;
  validTo?: Date | null;
  /** null = parâmetro global; uuid = empresa-específico. */
  companyId?: string | null;
  userId?: string;
}

@injectable()
export class UpsertTaxParameterUseCase {
  constructor(
    @inject('TaxParameterRepository')
    private readonly repo: ITaxParameterRepository,
    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute(req: IRequest): Promise<TaxParameter> {
    const created = await this.repo.upsert({
      chave: req.chave,
      valor: req.valor,
      fonteNorma: req.fonteNorma ?? null,
      validFrom: req.validFrom,
      validTo: req.validTo ?? null,
      companyId: req.companyId ?? null,
    });
    await this.audit.record({
      action: 'tax.parameter.upsert',
      entityType: 'tax_parameter',
      entityId: created.id,
      payload: {
        chave: req.chave,
        validFrom: req.validFrom,
        validTo: req.validTo ?? null,
        scope: req.companyId ? 'company' : 'global',
      },
    });
    return created;
  }
}

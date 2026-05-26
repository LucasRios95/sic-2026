import { inject, injectable } from 'tsyringe';

import { ICertificateRepository } from '@modules/Certificates/repositories/ICertificateRepository';
import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { BusinessRuleError } from '@shared/errors';

import { SefazHealthMonitorService } from '../../SefazHealthMonitorService';
import { ProbeOutcome } from '../../SefazHealthMonitorService';

interface IRequest {
  ambiente?: AmbienteSefaz;
}

/**
 * Probe manual disparado pelo admin via `POST /sefaz-health/probe`. Útil quando o
 * faturista relata "SEFAZ fora" e o operador quer confirmar antes que o cron rode.
 *
 * Reusa o mesmo caminho do worker — pega o primeiro certificado A1 ativo e probe ambos
 * os ambientes (a menos que o caller restrinja). Quando NÃO há certificado ativo,
 * retorna lista vazia (o caller mostra "sem certificado para probar").
 */
@injectable()
export class ProbeSefazHealthUseCase {
  constructor(
    @inject(SefazHealthMonitorService)
    private readonly monitor: SefazHealthMonitorService,

    @inject('CertificateRepository')
    private readonly certRepo: ICertificateRepository,
  ) {}

  async execute(request: IRequest): Promise<ProbeOutcome[]> {
    const cert = await this.certRepo.findFirstActive();
    if (!cert) {
      throw new BusinessRuleError(
        'Nenhum certificado A1 ativo encontrado — cadastre um antes de probar',
        'NO_ACTIVE_CERTIFICATE',
      );
    }
    const ambientes = request.ambiente
      ? [request.ambiente]
      : [AmbienteSefaz.HOMOLOGACAO, AmbienteSefaz.PRODUCAO];
    const out: ProbeOutcome[] = [];
    for (const amb of ambientes) {
      const r = await this.monitor.probeAll({
        ambiente: amb,
        companyId: cert.companyId,
        certificateVaultRef: cert.vaultRef,
      });
      out.push(...r);
    }
    return out;
  }
}

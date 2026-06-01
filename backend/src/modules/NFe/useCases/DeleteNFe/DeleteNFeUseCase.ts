import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { BusinessRuleError, NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

import { DocumentStatus } from '../../domain/nfe-enums';
import { INFeRepository } from '../../repositories/INFeRepository';
import { INumberingSeriesRepository } from '../../repositories/INumberingSeriesRepository';

interface IRequest {
  companyId: string;
  nfeId: string;
  userId: string;
}

interface IResponse {
  deletedId: string;
  numero: string;
  serie: number;
  /**
   * `true` quando a numeração desta NF-e era a última alocada e foi devolvida ao
   * `proximoNumero` da série — o faturista verá o mesmo número na próxima emissão.
   * `false` quando já houve outra alocação depois (slot virou gap; só Inutilização
   * regulariza).
   */
  numeroLiberado: boolean;
}

/**
 * Exclui uma NF-e do banco local. Usado para limpar lixo gerado por tentativas
 * de emissão que não viraram nota fiscal válida (rejeitadas, pendentes, drafts).
 *
 * A SEFAZ NÃO é notificada — esta é uma operação local. Por isso só permitimos
 * para status que NUNCA produziram efeito fiscal:
 *  - DRAFT, PENDING, SUBMITTED, REJECTED, ERROR
 *
 * Bloqueamos:
 *  - AUTHORIZED, CANCELLED, DENIED, INUTILIZED → já têm registro na SEFAZ;
 *    fiscalmente não podem sumir do histórico.
 *  - PROCESSING → ainda em trânsito; pode virar AUTHORIZED na reconciliação.
 *    Quem quiser desistir deve esperar a reconciliação resolver o status final
 *    antes de excluir.
 *
 * O slot (modelo+serie+numero) fica livre depois — útil para reemitir com a
 * mesma numeração quando o EmitirNFeUseCase encontra o slot vago.
 */
@injectable()
export class DeleteNFeUseCase {
  private static readonly DELETABLE_STATUSES = new Set<string>([
    DocumentStatus.DRAFT,
    DocumentStatus.PENDING,
    DocumentStatus.SUBMITTED,
    DocumentStatus.REJECTED,
    DocumentStatus.ERROR,
  ]);

  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,

    @inject('NumberingSeriesRepository')
    private readonly numberingRepository: INumberingSeriesRepository,

    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const nfe = await this.nfeRepository.findById(request.companyId, request.nfeId);
    if (!nfe) throw new NotFoundError('NF-e não encontrada');

    if (!DeleteNFeUseCase.DELETABLE_STATUSES.has(nfe.status)) {
      throw new BusinessRuleError(
        `NF-e em status ${nfe.status} não pode ser excluída. ` +
          'Notas autorizadas, canceladas, denegadas, inutilizadas ou em processamento ' +
          'têm registro na SEFAZ e devem permanecer no histórico.',
        'NFE_NOT_DELETABLE',
      );
    }

    await this.nfeRepository.hardDelete(nfe.id);

    // Devolve o número à série quando a NF-e excluída era a última alocada. Se já
    // houve outra alocação no meio tempo, `releaseLastIfMatches` devolve `released:false`
    // e a sequência continua intacta (preserva ordem fiscal).
    const release = await this.numberingRepository.releaseLastIfMatches(
      nfe.companyId,
      nfe.modelo,
      nfe.serie,
      nfe.numero,
    );

    await this.audit.record({
      action: 'nfe.delete',
      entityType: 'nfe',
      entityId: nfe.id,
      companyId: nfe.companyId,
      payload: {
        modelo: nfe.modelo,
        serie: nfe.serie,
        numero: nfe.numero,
        statusAnterior: nfe.status,
        chaveAcesso: nfe.chaveAcesso ?? null,
        cStat: nfe.cStat ?? null,
        xMotivo: nfe.xMotivo ?? null,
        numeroLiberado: release.released,
        proximoNumeroPos: release.proximoNumero,
      },
    });

    logger.info(
      {
        nfeId: nfe.id,
        numero: nfe.numero,
        status: nfe.status,
        userId: request.userId,
        numeroLiberado: release.released,
        proximoNumeroPos: release.proximoNumero,
      },
      'NF-e excluída do sistema (não-autorizada)',
    );

    return {
      deletedId: nfe.id,
      numero: nfe.numero,
      serie: nfe.serie,
      numeroLiberado: release.released,
    };
  }
}

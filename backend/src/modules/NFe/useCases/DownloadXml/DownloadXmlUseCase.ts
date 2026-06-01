import { inject, injectable } from 'tsyringe';

import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { DocumentStatus } from '../../domain/nfe-enums';
import { INFeRepository } from '../../repositories/INFeRepository';

interface IRequest {
  companyId: string;
  nfeId: string;
}

interface IResponse {
  /** Conteúdo XML (UTF-8 string). */
  xml: string;
  /** Tipo do XML retornado — pra UI deixar claro o que o usuário está baixando. */
  tipo: 'procNFe' | 'NFe' | 'NFeAssinada';
  /** Nome de arquivo sugerido — segue convenção comum dos sistemas fiscais brasileiros. */
  filename: string;
}

/**
 * Devolve o XML "mais completo possível" de uma NF-e:
 *  - AUTHORIZED: `xmlAutorizado` (procNFe — XML assinado + protocolo de autorização). Esse é o
 *    arquivo oficial pra escrituração e SPED. É o que o destinatário e a contabilidade esperam.
 *  - SUBMITTED/PROCESSING/REJECTED/DENIED com `xmlAssinado` populado: devolve o XML assinado
 *    sem o protocolo (útil pra debug/reenvio manual).
 *  - DRAFT/PENDING sem XML: 404 — não há o que baixar.
 *
 * Nome de arquivo segue o padrão histórico do mercado: `<chave>-procNFe.xml` quando autorizada,
 * `<chave>-nfe.xml` quando só assinada — facilita ingestão automática em outros sistemas.
 */
@injectable()
export class DownloadXmlUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const nfe = await this.nfeRepository.findById(request.companyId, request.nfeId);
    if (!nfe) throw new NotFoundError('NF-e não encontrada');

    if (nfe.status === DocumentStatus.AUTHORIZED && nfe.xmlAutorizado) {
      return {
        xml: nfe.xmlAutorizado,
        tipo: 'procNFe',
        filename: `${nfe.chaveAcesso ?? nfe.id}-procNFe.xml`,
      };
    }

    if (nfe.xmlAssinado) {
      return {
        xml: nfe.xmlAssinado,
        tipo: nfe.status === DocumentStatus.AUTHORIZED ? 'NFe' : 'NFeAssinada',
        filename: `${nfe.chaveAcesso ?? nfe.id}-nfe.xml`,
      };
    }

    throw new BusinessRuleError(
      `NF-e em status ${nfe.status} ainda não possui XML — emita primeiro.`,
      'NFE_XML_NOT_AVAILABLE',
    );
  }
}

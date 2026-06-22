import { inject, injectable } from 'tsyringe';

import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { normalizeAuthorizedXml } from '../../domain/authorized-xml';
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
  tipo: 'NFeAutorizada' | 'NFe' | 'NFeAssinada';
  /** Nome de arquivo sugerido — segue convenção comum dos sistemas fiscais brasileiros. */
  filename: string;
}

/**
 * Devolve o XML fiscal da NF-e:
 *  - AUTHORIZED: `nfeProc` (NF-e assinada + protocolo de autorização), normalizando
 *    registros antigos que guardaram a resposta SOAP bruta da SEFAZ.
 *  - SUBMITTED/PROCESSING/REJECTED/DENIED com `xmlAssinado` populado: devolve a NF-e
 *    assinada sem protocolo (útil pra debug/reenvio manual).
 *  - DRAFT/PENDING sem XML: 404 — não há o que baixar.
 *
 * Nome de arquivo: `<chave>.xml`, sem sufixos internos como `-procNFe`.
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

    if (nfe.status === DocumentStatus.AUTHORIZED && (nfe.xmlAutorizado || nfe.xmlAssinado)) {
      return {
        xml: normalizeAuthorizedXml(nfe.xmlAutorizado, nfe.xmlAssinado) ?? nfe.xmlAutorizado ?? nfe.xmlAssinado!,
        tipo: 'NFeAutorizada',
        filename: `${nfe.chaveAcesso ?? nfe.id}.xml`,
      };
    }

    if (nfe.xmlAssinado) {
      return {
        xml: nfe.xmlAssinado,
        tipo: nfe.status === DocumentStatus.AUTHORIZED ? 'NFe' : 'NFeAssinada',
        filename: `${nfe.chaveAcesso ?? nfe.id}.xml`,
      };
    }

    throw new BusinessRuleError(
      `NF-e em status ${nfe.status} ainda não possui XML — emita primeiro.`,
      'NFE_XML_NOT_AVAILABLE',
    );
  }
}

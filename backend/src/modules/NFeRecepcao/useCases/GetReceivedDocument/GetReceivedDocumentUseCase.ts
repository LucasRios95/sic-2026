import { inject, injectable } from 'tsyringe';

import { NotFoundError } from '@shared/errors';

import { DfeManifestation } from '../../infra/typeorm/entities/DfeManifestation';
import { ReceivedDocument } from '../../infra/typeorm/entities/ReceivedDocument';
import { IDfeManifestationRepository } from '../../repositories/IDfeManifestationRepository';
import { IReceivedDocumentRepository } from '../../repositories/IReceivedDocumentRepository';

interface IRequest {
  companyId: string;
  receivedDocumentId: string;
}

interface IResponse {
  document: ReceivedDocument;
  manifestations: DfeManifestation[];
}

@injectable()
export class GetReceivedDocumentUseCase {
  constructor(
    @inject('ReceivedDocumentRepository')
    private readonly documentRepository: IReceivedDocumentRepository,

    @inject('DfeManifestationRepository')
    private readonly manifestationRepository: IDfeManifestationRepository,
  ) {}

  async execute({ companyId, receivedDocumentId }: IRequest): Promise<IResponse> {
    const document = await this.documentRepository.findById(companyId, receivedDocumentId);
    if (!document) throw new NotFoundError('Documento recebido não encontrado');

    const manifestations = await this.manifestationRepository.listByDocument(document.id);
    return { document, manifestations };
  }
}

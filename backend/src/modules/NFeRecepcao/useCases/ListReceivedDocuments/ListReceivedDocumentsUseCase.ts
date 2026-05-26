import { inject, injectable } from 'tsyringe';

import {
  IReceivedDocumentRepository,
  ListReceivedDocumentsFilter,
} from '../../repositories/IReceivedDocumentRepository';

@injectable()
export class ListReceivedDocumentsUseCase {
  constructor(
    @inject('ReceivedDocumentRepository')
    private readonly repo: IReceivedDocumentRepository,
  ) {}

  async execute(filter: ListReceivedDocumentsFilter) {
    return this.repo.list(filter);
  }
}

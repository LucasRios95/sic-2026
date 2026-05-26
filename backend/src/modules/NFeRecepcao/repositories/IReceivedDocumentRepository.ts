import { ReceivedDocument } from '../infra/typeorm/entities/ReceivedDocument';
import { ReceivedDocumentStatus, TipoDFe } from '../domain/nfe-recepcao-enums';

export interface UpsertReceivedDocumentData {
  companyId: string;
  tipo: TipoDFe;
  chaveAcesso?: string | null;
  numero?: string | null;
  serie?: string | null;
  emitenteCnpj: string;
  emitenteNome: string;
  emitenteUf?: string | null;
  dhEmissao: Date;
  valorTotal: string;
  nsu?: string | null;
  resumoXml?: string | null;
}

export interface ListReceivedDocumentsFilter {
  companyId: string;
  status?: ReceivedDocumentStatus;
  emitenteCnpj?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface IReceivedDocumentRepository {
  /**
   * Insere ou atualiza por (companyId, chaveAcesso). Quando a chave é nula (raro),
   * sempre insere (não há critério de unicidade — risco de duplicata aceito).
   */
  upsertByChave(data: UpsertReceivedDocumentData): Promise<ReceivedDocument>;

  findById(companyId: string, id: string): Promise<ReceivedDocument | null>;

  findByChave(companyId: string, chaveAcesso: string): Promise<ReceivedDocument | null>;

  list(filter: ListReceivedDocumentsFilter): Promise<{
    items: ReceivedDocument[];
    total: number;
  }>;

  /** Atualiza o XML completo após manifestação. */
  setXmlCompleto(id: string, xml: string): Promise<void>;

  update(id: string, patch: Partial<ReceivedDocument>): Promise<ReceivedDocument>;
}

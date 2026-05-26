import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api';

function companyOrThrow(): string {
  const id = useAuthStore.getState().selectedCompanyId;
  if (!id) throw new Error('Empresa não selecionada');
  return id;
}

export type ReceivedDocumentStatus =
  | 'PENDENTE'
  | 'CONFERIDO'
  | 'ESCRITURADO'
  | 'DEVOLVIDO';

export type TipoDFe =
  | 'NFE_55'
  | 'NFCE_65'
  | 'NFSE_MUNICIPAL'
  | 'NFSE_NACIONAL'
  | 'CTE_57'
  | 'CTE_67_OS'
  | 'MDFE_58'
  | 'NFCOM'
  | 'DCE';

export type OrigemCaptura =
  | 'sefaz_distribuicao'
  | 'focus_nfsen'
  | 'upload_xml'
  | 'upload_pdf';

export type TipoManifestacao =
  | 'CIENCIA_OPERACAO'
  | 'CONFIRMACAO_OPERACAO'
  | 'DESCONHECIMENTO_OPERACAO'
  | 'OPERACAO_NAO_REALIZADA';

export interface ReceivedDocument {
  id: string;
  companyId: string;
  supplierId: string | null;
  tipo: TipoDFe;
  chaveAcesso: string | null;
  numero: string | null;
  serie: string | null;
  emitenteCnpj: string;
  emitenteNome: string;
  emitenteUf: string | null;
  dhEmissao: string;
  valorTotal: string;
  nsu: string | null;
  versaoFocus: string | null;
  status: ReceivedDocumentStatus;
  resumoXml: string | null;
  xmlCompleto: string | null;
  origemCaptura: OrigemCaptura;
  capturedAt: string;
  conferidoEm: string | null;
  conferidoBy: string | null;
  escrituradoEm: string | null;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListReceivedDocumentsFilter {
  status?: ReceivedDocumentStatus;
  emitenteCnpj?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface ListReceivedDocumentsResponse {
  items: ReceivedDocument[];
  total: number;
}

export async function listReceivedDocuments(
  filter: ListReceivedDocumentsFilter = {},
): Promise<ListReceivedDocumentsResponse> {
  const companyId = companyOrThrow();
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.emitenteCnpj) params.set('emitenteCnpj', filter.emitenteCnpj);
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.offset) params.set('offset', String(filter.offset));

  // O endpoint devolve { data, meta } — preciso do meta.total, então fetch direto.
  const { env } = await import('@/env');
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(
    `${env.apiBaseUrl}/fiscal/recebidos?${params.toString()}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Company-Id': companyId,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    data: ReceivedDocument[];
    meta: { total: number };
  };
  return { items: payload.data, total: payload.meta.total };
}

export interface DfeManifestationView {
  id: string;
  receivedDocumentId: string;
  tipo: TipoManifestacao;
  justificativa: string | null;
  dhEvento: string;
  status: string;
  protocolo: string | null;
  cStat: string | null;
  xMotivo: string | null;
  enviadoEm: string | null;
  retornoXml: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetReceivedDocumentResponse {
  document: ReceivedDocument;
  manifestations: DfeManifestationView[];
}

export async function getReceivedDocument(
  documentId: string,
): Promise<GetReceivedDocumentResponse> {
  return api<GetReceivedDocumentResponse>(`/fiscal/recebidos/${documentId}`, {
    method: 'GET',
    companyId: companyOrThrow(),
  });
}

export interface SyncRecebidosPayload {
  certificateVaultRef: string;
  maxIterations?: number;
}

export interface SyncRecebidosResponse {
  iterations: number;
  capturedDocs: number;
  finalCursor: string;
  lastCStat: string | null;
}

export async function syncRecebidos(
  payload: SyncRecebidosPayload,
): Promise<SyncRecebidosResponse> {
  return api<SyncRecebidosResponse>('/fiscal/recebidos/sync', {
    method: 'POST',
    body: payload,
    companyId: companyOrThrow(),
  });
}

export interface ManifestarPayload {
  tipo: TipoManifestacao;
  justificativa?: string;
  certificateVaultRef: string;
}

export interface ManifestarResponse {
  manifestation: {
    id: string;
    receivedDocumentId: string;
    tipo: TipoManifestacao;
    dhEvento: string;
    justificativa: string | null;
    status: string;
    protocolo: string | null;
    cStat: string | null;
    xMotivo: string | null;
    enviadoEm: string | null;
    retornoXml: string | null;
  };
  cStat: string | null;
  xMotivo: string | null;
  triggeredDownload: boolean;
}

export async function manifestarDocumento(
  documentId: string,
  payload: ManifestarPayload,
): Promise<ManifestarResponse> {
  return api<ManifestarResponse>(`/fiscal/recebidos/${documentId}/manifest`, {
    method: 'POST',
    body: payload,
    companyId: companyOrThrow(),
  });
}

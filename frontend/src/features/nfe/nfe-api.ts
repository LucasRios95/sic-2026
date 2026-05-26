import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api';
import type {
  DocumentStatus,
  NFeFull,
  NFeListItem,
  TaxSimulationResult,
} from '@/shared/types/fiscal';

function companyOrThrow(): string {
  const id = useAuthStore.getState().selectedCompanyId;
  if (!id) throw new Error('Empresa não selecionada');
  return id;
}

export interface ListNFesFilter {
  status?: DocumentStatus;
  customerId?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listNFes(filter: ListNFesFilter = {}): Promise<{
  items: NFeListItem[];
  total: number;
}> {
  const companyId = companyOrThrow();
  const params = new URLSearchParams();
  Object.entries(filter).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });

  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333'}/nfe?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
        'X-Company-Id': companyId,
      },
    },
  );
  const payload = (await response.json()) as { data: NFeListItem[]; meta: { total: number } };
  if (!response.ok) throw new Error('Falha ao listar NF-e');
  return { items: payload.data, total: payload.meta.total };
}

export async function getNFe(id: string): Promise<NFeFull> {
  return api<NFeFull>(`/nfe/${id}`, { companyId: companyOrThrow() });
}

export interface EmitirNFeItemPayload {
  numeroItem: number;
  productId: string;
  descricao?: string;
  cfop: string;
  unidadeComercial: string;
  quantidade: string;
  valorUnitario: string;
  valorDesconto?: string;
}

export type TipoOperacao = 'ENTRADA' | 'SAIDA';
export type FinalidadeNFe =
  | 'NORMAL'
  | 'COMPLEMENTAR'
  | 'AJUSTE'
  | 'DEVOLUCAO'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO';

/**
 * Códigos modFrete:
 *   0 = CIF (remetente paga)
 *   1 = FOB (destinatário paga)
 *   2 = Terceiros
 *   3 = Próprio remetente
 *   4 = Próprio destinatário
 *   9 = Sem ocorrência de transporte
 */
export type ModFrete = 0 | 1 | 2 | 3 | 4 | 9;

export interface NFeTransportadoraInput {
  cnpjCpf?: string | null;
  nome?: string | null;
  ie?: string | null;
  endereco?: string | null;
  municipio?: string | null;
  uf?: string | null;
}

export interface NFeVolumeInput {
  quantidade?: number;
  especie?: string | null;
  marca?: string | null;
  numeracao?: string | null;
  pesoLiquido?: string | null;
  pesoBruto?: string | null;
}

export interface NFeTransporteInput {
  transportadora?: NFeTransportadoraInput;
  veiculo?: { placa: string; uf: string; rntc?: string | null };
  volumes?: NFeVolumeInput[];
}

export interface EmitirNFePayload {
  idempotencyKey: string;
  customerId: string;
  serie: number;
  naturezaOperacao: string;
  tipoOperacao?: TipoOperacao;
  finalidade?: FinalidadeNFe;
  /** NF-e referenciadas (chave 44 dígitos). Obrigatório para devolução/complementar/ajuste. */
  nfeReferenciadas?: Array<{ chaveAcesso: string }>;
  modalidadeFrete?: ModFrete;
  transporte?: NFeTransporteInput;
  itens: EmitirNFeItemPayload[];
  pagamentos: Array<{ meio: string; valor: string }>;
  infCpl?: string;
  certificateVaultRef?: string;
  transmitirImediatamente?: boolean;
}

export async function emitirNFe(
  payload: EmitirNFePayload,
): Promise<{ nfe: NFeFull; alreadyEmitted: boolean }> {
  return api<{ nfe: NFeFull; alreadyEmitted: boolean }>('/nfe', {
    method: 'POST',
    body: payload,
    companyId: companyOrThrow(),
  });
}

export async function cancelNFe(
  id: string,
  payload: { justificativa: string; certificateVaultRef: string },
): Promise<{ nfe: NFeFull; cStat: string | null; xMotivo: string | null }> {
  return api<{ nfe: NFeFull; cStat: string | null; xMotivo: string | null }>(
    `/nfe/${id}/cancel`,
    {
      method: 'POST',
      body: payload,
      companyId: companyOrThrow(),
    },
  );
}

export async function emitirCce(
  id: string,
  payload: { correcao: string; certificateVaultRef: string },
): Promise<{ sequencial: number; cStat: string | null; xMotivo: string | null }> {
  return api<{ sequencial: number; cStat: string | null; xMotivo: string | null }>(
    `/nfe/${id}/cce`,
    {
      method: 'POST',
      body: payload,
      companyId: companyOrThrow(),
    },
  );
}

export async function generateDanfe(
  id: string,
): Promise<{ storageKey: string; signedUrl: string; bytes: number; regenerated: boolean }> {
  return api<{ storageKey: string; signedUrl: string; bytes: number; regenerated: boolean }>(
    `/nfe/${id}/danfe`,
    {
      method: 'POST',
      companyId: companyOrThrow(),
    },
  );
}

export async function sendNFeByEmail(
  id: string,
  payload: { to?: string } = {},
): Promise<{ messageId: string; to: string; danfeUrl: string }> {
  return api<{ messageId: string; to: string; danfeUrl: string }>(`/nfe/${id}/email`, {
    method: 'POST',
    body: payload,
    companyId: companyOrThrow(),
  });
}

export interface SimulateTaxPayload {
  destinatario: {
    uf: string;
    consumidorFinal: boolean;
    indicadorIE: 'CONTRIBUINTE' | 'ISENTO' | 'NAO_CONTRIBUINTE';
  };
  itens: Array<{
    itemId: string;
    productId: string;
    quantidade: string;
    valorUnitario: string;
    cfop: string;
  }>;
}

export async function simulateTax(payload: SimulateTaxPayload): Promise<TaxSimulationResult> {
  return api<TaxSimulationResult>('/tax/simulate', {
    method: 'POST',
    body: payload,
    companyId: companyOrThrow(),
  });
}

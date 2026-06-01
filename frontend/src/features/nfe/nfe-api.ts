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

/**
 * Lê o próximo número da série SEM reservar. Usado pela UI de emissão pra
 * pré-popular o campo "Número"; o faturista pode aceitar ou editar.
 */
export async function getProximoNumero(
  serie = 1,
  modelo = '55',
): Promise<{
  modelo: string;
  serie: number;
  proximoNumero: string;
  ultimoUsado: string | null;
}> {
  return api<{
    modelo: string;
    serie: number;
    proximoNumero: string;
    ultimoUsado: string | null;
  }>(`/nfe/proximo-numero?serie=${serie}&modelo=${modelo}`, {
    companyId: companyOrThrow(),
  });
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
  /**
   * Número da NF-e (BigInt como string). Opcional — quando omitido, o backend
   * aloca o próximo automaticamente. Quando informado, força esse valor e a
   * sequência seguinte continua a partir dele.
   */
  numero?: string;
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

export interface EmitirNFeResult {
  nfe: NFeFull;
  alreadyEmitted: boolean;
  /**
   * Mensagem da falha de transmissão quando a NFe foi para PROCESSING porque a
   * chamada à SEFAZ falhou (timeout, TLS, 5xx). `null` significa transmissão OK
   * ou que nem houve tentativa (sem certificado). UI exibe ao usuário.
   */
  transmissionError: string | null;
}

export async function emitirNFe(payload: EmitirNFePayload): Promise<EmitirNFeResult> {
  return api<EmitirNFeResult>('/nfe', {
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

/**
 * Exclui a NF-e do sistema local. Backend rejeita se o status já produziu efeito
 * fiscal (AUTHORIZED/CANCELLED/DENIED/INUTILIZED/PROCESSING) — ver DeleteNFeUseCase.
 */
export async function deleteNFe(
  id: string,
): Promise<{ deletedId: string; numero: string; serie: number }> {
  return api<{ deletedId: string; numero: string; serie: number }>(`/nfe/${id}`, {
    method: 'DELETE',
    companyId: companyOrThrow(),
  });
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

/**
 * Baixa o XML da NF-e diretamente no navegador. Usamos fetch + Blob em vez de `window.open`
 * porque o backend exige header Authorization — `<a href>` ou `window.open` não conseguem
 * mandar o Bearer token. O nome do arquivo vem do header `Content-Disposition`.
 */
export async function downloadNFeXml(id: string): Promise<void> {
  const companyId = companyOrThrow();
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333';
  const response = await fetch(`${baseUrl}/nfe/${id}/xml`, {
    headers: {
      Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
      'X-Company-Id': companyId,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Falha ao baixar XML (HTTP ${response.status})`);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? `nfe-${id}.xml`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

export interface InutilizarFaixaPayload {
  serie: number;
  numeroInicial: number;
  numeroFinal: number;
  justificativa: string;
  ano?: number;
  certificateVaultRef: string;
}

export interface InutilizarFaixaResult {
  inutId: string;
  protocolo: string | null;
  cStat: string | null;
  xMotivo: string | null;
  faixa: { inicial: number; final: number };
}

/**
 * Inutiliza uma faixa de numeração NÃO USADA. Backend valida que a faixa não tem NF-e
 * emitida (status != DRAFT) e transmite o evento à SEFAZ.
 */
export async function inutilizarFaixa(
  payload: InutilizarFaixaPayload,
): Promise<InutilizarFaixaResult> {
  return api<InutilizarFaixaResult>(`/nfe/inutilizar`, {
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

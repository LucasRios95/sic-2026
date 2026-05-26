import { api } from '@/lib/api';

export type CfopTipoOperacao = 'ENTRADA' | 'SAIDA';
export type CfopEscopo = 'ESTADUAL' | 'INTERESTADUAL' | 'EXTERIOR';

export interface Cfop {
  id: string;
  codigo: string;
  descricao: string;
  tipoOperacao: CfopTipoOperacao;
  escopo: CfopEscopo;
  grupo: string | null;
  geraCreditoPisCofins: boolean;
  ativo: boolean;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCfopsFilter {
  search?: string;
  tipoOperacao?: CfopTipoOperacao;
  escopo?: CfopEscopo;
  apenasGeraCredito?: boolean;
  apenasAtivos?: boolean;
}

export interface UpsertCfopPayload {
  codigo: string;
  descricao: string;
  grupo?: string | null;
  geraCreditoPisCofins?: boolean;
  ativo?: boolean;
  observacoes?: string | null;
}

export async function listCfops(filter: ListCfopsFilter = {}): Promise<Cfop[]> {
  const params = new URLSearchParams();
  if (filter.search) params.set('search', filter.search);
  if (filter.tipoOperacao) params.set('tipoOperacao', filter.tipoOperacao);
  if (filter.escopo) params.set('escopo', filter.escopo);
  if (filter.apenasGeraCredito) params.set('apenasGeraCredito', 'true');
  if (filter.apenasAtivos === false) params.set('apenasAtivos', 'false');
  const qs = params.toString();
  return api<Cfop[]>(`/cfops${qs ? `?${qs}` : ''}`);
}

export async function upsertCfop(payload: UpsertCfopPayload): Promise<Cfop> {
  return api<Cfop>('/cfops', { method: 'POST', body: payload });
}

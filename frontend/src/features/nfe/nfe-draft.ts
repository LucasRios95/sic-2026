import type { FinalidadeNFe, ModFrete, TipoOperacao } from './nfe-api';

/** Item do rascunho — espelha o `ItemRow` da tela de emissão (objeto plano serializável). */
export interface NFeDraftItem {
  id: string;
  productId: string;
  cfop: string;
  quantidade: string;
  valorUnitario: string;
  valorDesconto: string;
  valorFrete: string;
  icmsCodigo: string;
}

/** Snapshot completo do formulário de nova NF-e, persistido localmente. */
export interface NFeDraft {
  customerId: string;
  serie: number;
  numero: string;
  naturezaOperacao: string;
  tipoOperacao: TipoOperacao;
  finalidade: FinalidadeNFe;
  chavesReferenciadas: string[];
  infCpl: string;
  items: NFeDraftItem[];
  pagamentoMeio: string;
  condicaoPagamento: '0' | '1';
  certificateVaultRef: string;
  transmitirImediatamente: boolean;
  modFrete: ModFrete;
  transpCnpjCpf: string;
  transpNome: string;
  transpIE: string;
  transpEndereco: string;
  transpMunicipio: string;
  transpUf: string;
  veicPlaca: string;
  veicUf: string;
  volQtd: string;
  volEspecie: string;
  volPesoLiq: string;
  volPesoBruto: string;
  /** epoch ms de quando o rascunho foi salvo (usado no banner de recuperação). */
  savedAt: number;
}

const PREFIX = 'sic-2026:nfe-draft:';
const keyFor = (companyId: string): string => `${PREFIX}${companyId}`;

/** Um rascunho só vale a pena salvar/recuperar se tem cliente ou algum item escolhido. */
export function draftHasContent(d: Pick<NFeDraft, 'customerId' | 'items'>): boolean {
  return !!d.customerId || d.items.some((it) => !!it.productId);
}

export function loadNFeDraft(companyId: string | null): NFeDraft | null {
  if (!companyId) return null;
  try {
    const raw = localStorage.getItem(keyFor(companyId));
    if (!raw) return null;
    return JSON.parse(raw) as NFeDraft;
  } catch {
    return null;
  }
}

export function saveNFeDraft(companyId: string | null, draft: NFeDraft): void {
  if (!companyId) return;
  try {
    localStorage.setItem(keyFor(companyId), JSON.stringify(draft));
  } catch {
    // localStorage cheio/indisponível (modo privado, cota): ignora silenciosamente.
  }
}

export function clearNFeDraft(companyId: string | null): void {
  if (!companyId) return;
  try {
    localStorage.removeItem(keyFor(companyId));
  } catch {
    // ignora
  }
}

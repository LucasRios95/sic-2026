import { CstIbsCbs } from '@shared/types/fiscal-enums';

/**
 * Passo da memória de cálculo. Cada calculadora registra o que aplicou e por quê,
 * permitindo auditoria detalhada quando a apuração diverge do esperado (PRD seção 6.2.2 — NFE-25).
 */
export interface PassoMemoria {
  calculadora: string;
  resumo: string;
  /** Valores intermediários relevantes (base, alíquota, fator) — só para depuração/auditoria. */
  detalhe: Record<string, string | number | boolean | null>;
}

/**
 * Resultado por item. Espelha em grande parte os campos de NFeItem do schema Prisma v1.3,
 * para que o módulo de emissão de NF-e (Fase 1a) possa persistir 1:1 sem mapeamentos extra.
 *
 * Convenção: campos nulos significam "tributo não se aplica a este item" (e portanto não
 * devem ir para o XML). Sempre que aplicado, o resultado vem acompanhado de uma entrada em
 * `memoria`.
 */
export interface ResultadoCalculoItem {
  itemId: string;
  /** Valor total do item antes dos tributos (qtd × unit. − desconto + outros). */
  valorTotal: string;

  // --- ICMS próprio ---
  baseIcms?: string;
  aliqIcms?: string;
  valorIcms?: string;
  motDesICMS?: number;
  valorIcmsDeson?: string;

  // --- ICMS-ST ---
  baseIcmsST?: string;
  aliqIcmsST?: string;
  valorIcmsST?: string;
  pMVAST?: string;
  modBCST?: number;

  // --- FCP próprio ---
  baseFCP?: string;
  pFCP?: string;
  valorFCP?: string;

  // --- DIFAL (operação interestadual + consumidor final) ---
  baseICMSUFDest?: string;
  pICMSUFDest?: string;
  pICMSInter?: string;
  valorICMSUFDest?: string;
  valorICMSUFRemet?: string;

  // --- FCP destino (acompanha DIFAL) ---
  baseFCPUFDest?: string;
  pFCPUFDest?: string;
  valorFCPUFDest?: string;

  // --- IPI ---
  baseIpi?: string;
  aliqIpi?: string;
  valorIpi?: string;

  // --- PIS / COFINS (regime antigo) ---
  basePis?: string;
  aliqPis?: string;
  valorPis?: string;
  baseCofins?: string;
  aliqCofins?: string;
  valorCofins?: string;

  // --- IBS / CBS / IS (Reforma) ---
  cstIbsCbs?: CstIbsCbs;
  cClassTrib?: string;
  baseIbsCbs?: string;
  aliqIbs?: string;
  valorIbs?: string;
  aliqCbs?: string;
  valorCbs?: string;
  cstIs?: string;
  aliqIs?: string;
  valorIs?: string;
  /** Marca explícita que o cálculo IBS/CBS é do "ano-teste 2026" (sem recolhimento real). */
  modoAnoTesteIbsCbs?: boolean;

  memoria: PassoMemoria[];
  warnings: string[];
}

/**
 * Totais agregados do documento — base direta para os totais da NF-e (tag <total>).
 */
export interface TotaisDocumento {
  valorProdutos: string;
  valorDesconto: string;
  valorFrete: string;
  valorSeguro: string;
  valorOutros: string;
  valorTotal: string;

  valorIcms: string;
  valorIcmsDeson: string;
  valorIcmsST: string;
  valorFCP: string;
  valorICMSUFDest: string;
  valorICMSUFRemet: string;
  valorFCPUFDest: string;
  valorIpi: string;
  valorPis: string;
  valorCofins: string;

  baseIbsCbs: string;
  valorIbs: string;
  valorCbs: string;
  valorIs: string;
  modoAnoTesteIbsCbs: boolean;
}

export interface ResultadoCalculoDocumento {
  itens: ResultadoCalculoItem[];
  totais: TotaisDocumento;
  warnings: string[];
}

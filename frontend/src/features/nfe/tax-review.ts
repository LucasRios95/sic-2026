import { formatDecimal, parseDecimal } from '@/lib/format';
import type { TaxSimulationItem } from '@/shared/types/fiscal';

import type { AjustesTributarios } from './nfe-api';

/**
 * Conferência de impostos da emissão (modal "Impostos"): catálogo dos tributos que o
 * faturista pode conferir/ajustar e conversão do que ele digitou para o contrato da API.
 *
 * O backend é a fonte da verdade do cálculo — aqui não recalculamos nada. O fluxo é:
 * digita base/alíquota → "Recalcular" → os ajustes vão no POST /tax/simulate (e depois na
 * emissão) → o motor devolve valor = base × alíquota e os totais da nota.
 */

export type CampoAjuste =
  | 'icms.base'
  | 'icms.aliquota'
  | 'icms.pDif'
  | 'creditoSn.base'
  | 'creditoSn.aliquota'
  | 'icmsSt.mva'
  | 'icmsSt.base'
  | 'icmsSt.aliquota'
  | 'ipi.base'
  | 'ipi.aliquota'
  | 'pis.base'
  | 'pis.aliquota'
  | 'cofins.base'
  | 'cofins.aliquota'
  | 'difal.base'
  | 'difal.aliquotaDestino'
  | 'difal.aliquotaInterestadual'
  | 'fcpDestino.aliquota'
  | 'ibsCbs.base'
  | 'ibsCbs.aliquotaIbs'
  | 'ibsCbs.aliquotaCbs';

/**
 * Ajustes como o faturista digitou (texto no padrão BR, "18,00"). Campo ausente = cálculo
 * automático. Plano (chave "grupo.campo") para caber direto no state e no rascunho local.
 */
export type AjustesDigitados = Partial<Record<CampoAjuste, string>>;

type CampoResultado = keyof TaxSimulationItem;

export interface CampoDef {
  chave: CampoAjuste;
  /** Campo do resultado do motor exibido quando não há ajuste. */
  atual: CampoResultado;
  /** Percentuais têm teto de 100% no backend (exceto MVA). */
  tipo: 'valor' | 'aliquota' | 'mva';
  rotulo: string;
}

export interface TributoDef {
  id: string;
  rotulo: string;
  /** Nome da calculadora do motor — o tributo só aparece se ela se aplicou ao item. */
  calculadora: string;
  /** Base editável, ou só exibida (FCP destino segue a base do DIFAL). */
  base: CampoDef | { somenteLeitura: CampoResultado };
  aliquota: CampoDef;
  /** Terceiro campo (MVA da ST, alíquota interestadual do DIFAL, % diferimento do ICMS). */
  extra?: CampoDef;
  /** Quando o terceiro campo só faz sentido para alguns itens (ex.: diferimento só no CST 51). */
  mostrarExtra?: (r: TaxSimulationItem) => boolean;
  valor: CampoResultado;
  /** Quando o tributo se aplica mas o código fiscal do item não leva valor no XML. */
  bloqueio?: (r: TaxSimulationItem) => string | null;
}

const CST_IPI_TRIBUTADO = ['00', '49', '50', '99'];
const CST_PIS_COFINS_NT = ['04', '05', '06', '07', '08', '09'];
const CST_IBS_CBS_SEM_TRIBUTACAO = ['ISENCAO', 'IMUNIDADE', 'NAO_INCIDENCIA'];

const baseIbsCbs: CampoDef = {
  chave: 'ibsCbs.base',
  atual: 'baseIbsCbs',
  tipo: 'valor',
  rotulo: 'Base IBS/CBS',
};

const bloqueioIbsCbs = (r: TaxSimulationItem): string | null =>
  r.cstIbsCbs && CST_IBS_CBS_SEM_TRIBUTACAO.includes(r.cstIbsCbs)
    ? `Sem tributação (${r.cstIbsCbs.toLowerCase().replace('_', ' ')})`
    : null;

export const TRIBUTOS: TributoDef[] = [
  {
    id: 'icms',
    rotulo: 'ICMS',
    calculadora: 'icms-proprio',
    base: { chave: 'icms.base', atual: 'baseIcms', tipo: 'valor', rotulo: 'Base ICMS' },
    aliquota: { chave: 'icms.aliquota', atual: 'aliqIcms', tipo: 'aliquota', rotulo: 'Alíq. ICMS' },
    // CST 51: o valor exibido é o destacado (ICMS da operação − parcela diferida).
    extra: { chave: 'icms.pDif', atual: 'pDif', tipo: 'aliquota', rotulo: '% diferimento' },
    mostrarExtra: (r) => r.codigos.cstIcms?.padStart(2, '0') === '51',
    valor: 'valorIcms',
  },
  {
    id: 'creditoSn',
    rotulo: 'Crédito ICMS (Simples)',
    calculadora: 'credito-sn',
    base: { chave: 'creditoSn.base', atual: 'baseCredSN', tipo: 'valor', rotulo: 'Base do crédito' },
    aliquota: {
      chave: 'creditoSn.aliquota',
      atual: 'pCredSN',
      tipo: 'aliquota',
      rotulo: 'Alíq. crédito (pCredSN)',
    },
    valor: 'valorCredSN',
  },
  {
    id: 'icmsSt',
    rotulo: 'ICMS-ST',
    calculadora: 'icms-st',
    base: { chave: 'icmsSt.base', atual: 'baseIcmsST', tipo: 'valor', rotulo: 'Base ST' },
    aliquota: {
      chave: 'icmsSt.aliquota',
      atual: 'aliqIcmsST',
      tipo: 'aliquota',
      rotulo: 'Alíq. interna destino',
    },
    extra: { chave: 'icmsSt.mva', atual: 'pMVAST', tipo: 'mva', rotulo: 'MVA %' },
    valor: 'valorIcmsST',
  },
  {
    id: 'ipi',
    rotulo: 'IPI',
    calculadora: 'ipi',
    base: { chave: 'ipi.base', atual: 'baseIpi', tipo: 'valor', rotulo: 'Base IPI' },
    aliquota: { chave: 'ipi.aliquota', atual: 'aliqIpi', tipo: 'aliquota', rotulo: 'Alíq. IPI' },
    valor: 'valorIpi',
    bloqueio: (r) =>
      r.codigos.cstIpi && !CST_IPI_TRIBUTADO.includes(r.codigos.cstIpi)
        ? `CST ${r.codigos.cstIpi} sem destaque de IPI`
        : null,
  },
  {
    id: 'pis',
    rotulo: 'PIS',
    calculadora: 'pis-cofins',
    base: { chave: 'pis.base', atual: 'basePis', tipo: 'valor', rotulo: 'Base PIS' },
    aliquota: { chave: 'pis.aliquota', atual: 'aliqPis', tipo: 'aliquota', rotulo: 'Alíq. PIS' },
    valor: 'valorPis',
    bloqueio: (r) =>
      r.codigos.cstPis && CST_PIS_COFINS_NT.includes(r.codigos.cstPis)
        ? `CST ${r.codigos.cstPis} não tributado`
        : null,
  },
  {
    id: 'cofins',
    rotulo: 'COFINS',
    calculadora: 'pis-cofins',
    base: { chave: 'cofins.base', atual: 'baseCofins', tipo: 'valor', rotulo: 'Base COFINS' },
    aliquota: {
      chave: 'cofins.aliquota',
      atual: 'aliqCofins',
      tipo: 'aliquota',
      rotulo: 'Alíq. COFINS',
    },
    valor: 'valorCofins',
    bloqueio: (r) =>
      r.codigos.cstCofins && CST_PIS_COFINS_NT.includes(r.codigos.cstCofins)
        ? `CST ${r.codigos.cstCofins} não tributado`
        : null,
  },
  {
    id: 'difal',
    rotulo: 'DIFAL (UF destino)',
    calculadora: 'difal',
    base: { chave: 'difal.base', atual: 'baseICMSUFDest', tipo: 'valor', rotulo: 'Base DIFAL' },
    aliquota: {
      chave: 'difal.aliquotaDestino',
      atual: 'pICMSUFDest',
      tipo: 'aliquota',
      rotulo: 'Alíq. interna destino',
    },
    extra: {
      chave: 'difal.aliquotaInterestadual',
      atual: 'pICMSInter',
      tipo: 'aliquota',
      rotulo: 'Alíq. interestadual',
    },
    valor: 'valorICMSUFDest',
  },
  {
    id: 'fcpDestino',
    rotulo: 'FCP (UF destino)',
    calculadora: 'fcp-destino',
    base: { somenteLeitura: 'baseFCPUFDest' },
    aliquota: {
      chave: 'fcpDestino.aliquota',
      atual: 'pFCPUFDest',
      tipo: 'aliquota',
      rotulo: 'Alíq. FCP',
    },
    valor: 'valorFCPUFDest',
  },
  {
    id: 'ibs',
    rotulo: 'IBS',
    calculadora: 'ibs-cbs',
    base: baseIbsCbs,
    aliquota: { chave: 'ibsCbs.aliquotaIbs', atual: 'aliqIbs', tipo: 'aliquota', rotulo: 'Alíq. IBS' },
    valor: 'valorIbs',
    bloqueio: bloqueioIbsCbs,
  },
  {
    id: 'cbs',
    rotulo: 'CBS',
    calculadora: 'ibs-cbs',
    // Mesma chave do IBS: a base é única para os dois no XML (gIBSCBS/vBC).
    base: baseIbsCbs,
    aliquota: { chave: 'ibsCbs.aliquotaCbs', atual: 'aliqCbs', tipo: 'aliquota', rotulo: 'Alíq. CBS' },
    valor: 'valorCbs',
    bloqueio: bloqueioIbsCbs,
  },
];

/** Linha só de leitura do modal: valores que o motor apura, mas o faturista não ajusta. */
export interface InformativoDef {
  id: string;
  rotulo: string;
  calculadora: string;
  valor: CampoResultado;
  /** Texto das colunas do meio (ex.: parcelas federal/estadual). */
  detalhe?: (r: TaxSimulationItem) => string | null;
  /** Só aparece quando houver valor (ex.: desoneração é exceção, não regra). */
  somenteComValor?: boolean;
}

export const INFORMATIVOS: InformativoDef[] = [
  {
    id: 'icmsDeson',
    rotulo: 'ICMS desonerado',
    calculadora: 'icms-proprio',
    valor: 'valorIcmsDeson',
    somenteComValor: true,
  },
  {
    id: 'totTrib',
    rotulo: 'Tributos aprox. (Lei 12.741)',
    calculadora: 'tributos-aproximados',
    valor: 'valorTotTrib',
    detalhe: (r) =>
      r.valorTotTrib
        ? `Federal R$ ${formatDecimal(r.valorTotTribFederal)} · Estadual R$ ${formatDecimal(r.valorTotTribEstadual)}`
        : null,
  },
];

/** Motivo do motor para o tributo não se aplicar ao item (fallback genérico). */
export function motivoNaoAplica(r: TaxSimulationItem, calculadora: string): string {
  return r.calculadorasNaoAplicadas?.[calculadora] ?? 'Não se aplica a este item';
}

/** Decimal não negativo no formato da API, depois de normalizar o texto BR. */
const DECIMAL_NAO_NEGATIVO = /^\d+(\.\d+)?$/;

/** Mensagem de erro do campo digitado, ou null quando válido. Vazio = válido (automático). */
export function erroCampo(texto: string | undefined, tipo: CampoDef['tipo']): string | null {
  if (texto === undefined || texto.trim() === '') return null;
  const normalizado = parseDecimal(texto);
  if (!DECIMAL_NAO_NEGATIVO.test(normalizado)) return 'Número inválido';
  if (tipo === 'aliquota' && Number(normalizado) > 100) return 'Acima de 100%';
  return null;
}

/** Remove campos vazios (vazio = "voltar ao automático"). */
export function limparAjustes(d: AjustesDigitados): AjustesDigitados {
  const out: AjustesDigitados = {};
  for (const [chave, texto] of Object.entries(d) as Array<[CampoAjuste, string | undefined]>) {
    if (texto !== undefined && texto.trim() !== '') out[chave] = texto.trim();
  }
  return out;
}

export function contarAjustes(d: AjustesDigitados | undefined): number {
  return d ? Object.keys(limparAjustes(d)).length : 0;
}

/**
 * Texto BR digitado → payload da API (ponto decimal, agrupado por tributo). Campos
 * inválidos ficam de fora — o modal não deixa recalcular com erro, mas um rascunho antigo
 * com lixo não pode derrubar o simulate inteiro com 422.
 */
export function ajustesParaApi(d: AjustesDigitados | undefined): AjustesTributarios | undefined {
  if (!d) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [chave, texto] of Object.entries(limparAjustes(d))) {
    const valor = parseDecimal(texto);
    if (!DECIMAL_NAO_NEGATIVO.test(valor)) continue;
    const [grupo, campo] = chave.split('.');
    (out[grupo] ??= {})[campo] = valor;
  }
  return Object.keys(out).length > 0 ? (out as AjustesTributarios) : undefined;
}

/** "18.0000" → "18,00"; "1.6500" → "1,65"; "0.9" → "0,90" (sem milhar — vai num input). */
export function paraInput(valor: string | undefined, tipo: CampoDef['tipo']): string {
  if (valor === undefined || valor === null || valor === '') return '';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: tipo === 'valor' ? 2 : 4,
    useGrouping: false,
  });
}

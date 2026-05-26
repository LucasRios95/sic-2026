/**
 * Catálogo opinativo dos tipos de parâmetro tributário que o sistema reconhece.
 *
 * A tabela `tax_parameters` no backend é flexível (JSON livre por chave) pra absorver
 * mudanças normativas sem migration. Mas pra usuário comum isso é confuso. Aqui mapeamos
 * cada chave canônica num formulário com campos amigáveis (alíquota, modo, UF, data) e
 * fazemos a serialização/desserialização do JSON nos bastidores.
 *
 * Quando uma nova chave entrar em vigor (ex.: alíquota IS de combustíveis), adicionamos
 * uma entrada aqui — sem mudar nada no backend.
 */

export type ParameterKind =
  | 'IBS_ALIQUOTA_PADRAO'
  | 'CBS_ALIQUOTA_PADRAO'
  | 'IBS_ALIQUOTA_UF'
  | 'IS_ALIQUOTA'
  | 'PIS_COFINS_ENCERRAMENTO';

export type ModoReforma = 'ANO_TESTE' | 'PLENO';

/** Estado unificado do formulário — campos opcionais variam por kind. */
export interface ParameterFormState {
  kind: ParameterKind;
  /** % como string (ex.: "0.10", "12.5"). */
  aliquota?: string;
  /** ANO_TESTE = só destaque sem recolhimento; PLENO = recolhimento real. */
  modo?: ModoReforma;
  /** UF de destino quando aplicável (ex.: alíquota IBS por UF). */
  uf?: string;
  /** Data ISO (YYYY-MM-DD) para parâmetros que carregam data específica. */
  data?: string;
  /** Rótulo/categoria opcional para parâmetros como "IS combustível". */
  categoria?: string;
}

export interface ParameterTypeDefinition {
  kind: ParameterKind;
  label: string;
  description: string;
  /** Ícone Lucide — informado por nome, resolvido na page. */
  icon: 'percent' | 'map-pin' | 'calendar' | 'gauge';
  /** Tom da cor (mapeia para classes do design system). */
  tone: 'primary' | 'accent' | 'info' | 'warning';
  /** Campos do form a renderizar. */
  fields: Array<'aliquota' | 'modo' | 'uf' | 'data' | 'categoria'>;
  /** Monta a chave canônica (`ibs.aliquota.padrao`, `ibs.aliquota.uf.SP`...). */
  buildChave(form: ParameterFormState): string;
  /** Monta o JSON pro backend. */
  buildValor(form: ParameterFormState): unknown;
  /** Render amigável do valor pra exibir no card. */
  renderValue(valor: unknown): string;
  /** Detecta o kind a partir da chave persistida — usado pra reabrir editor. */
  detectKind(chave: string): boolean;
  /** Inverte o JSON pra preencher o form ao editar. */
  parseValor(chave: string, valor: unknown): Partial<ParameterFormState>;
}

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

function asObj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function pct(s: string | undefined): string {
  if (!s) return '—';
  const num = Number(s);
  if (Number.isNaN(num)) return s;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 4 }) + '%';
}

export const PARAMETER_TYPES: ParameterTypeDefinition[] = [
  {
    kind: 'IBS_ALIQUOTA_PADRAO',
    label: 'Alíquota IBS padrão (Reforma)',
    description:
      'Alíquota do IBS aplicada a operações sem regime especial. Defina o modo de cobrança (ano-teste ou pleno).',
    icon: 'percent',
    tone: 'primary',
    fields: ['aliquota', 'modo'],
    buildChave: () => 'ibs.aliquota.padrao',
    buildValor: (f) => ({ aliquota: f.aliquota, modo: f.modo ?? 'ANO_TESTE' }),
    detectKind: (chave) => chave === 'ibs.aliquota.padrao',
    parseValor: (_chave, valor) => {
      const v = asObj(valor);
      return {
        aliquota: typeof v.aliquota === 'string' ? v.aliquota : String(v.aliquota ?? ''),
        modo: v.modo === 'PLENO' ? 'PLENO' : 'ANO_TESTE',
      };
    },
    renderValue: (valor) => {
      const v = asObj(valor);
      const aliq = typeof v.aliquota === 'string' ? v.aliquota : String(v.aliquota ?? '');
      const modo = v.modo === 'PLENO' ? 'Cobrança plena' : 'Ano-teste (sem recolhimento)';
      return `${pct(aliq)} · ${modo}`;
    },
  },
  {
    kind: 'CBS_ALIQUOTA_PADRAO',
    label: 'Alíquota CBS padrão (Reforma)',
    description:
      'Alíquota da CBS aplicada a operações sem regime especial. Defina o modo de cobrança.',
    icon: 'percent',
    tone: 'info',
    fields: ['aliquota', 'modo'],
    buildChave: () => 'cbs.aliquota.padrao',
    buildValor: (f) => ({ aliquota: f.aliquota, modo: f.modo ?? 'ANO_TESTE' }),
    detectKind: (chave) => chave === 'cbs.aliquota.padrao',
    parseValor: (_chave, valor) => {
      const v = asObj(valor);
      return {
        aliquota: typeof v.aliquota === 'string' ? v.aliquota : String(v.aliquota ?? ''),
        modo: v.modo === 'PLENO' ? 'PLENO' : 'ANO_TESTE',
      };
    },
    renderValue: (valor) => {
      const v = asObj(valor);
      const aliq = typeof v.aliquota === 'string' ? v.aliquota : String(v.aliquota ?? '');
      const modo = v.modo === 'PLENO' ? 'Cobrança plena' : 'Ano-teste (sem recolhimento)';
      return `${pct(aliq)} · ${modo}`;
    },
  },
  {
    kind: 'IBS_ALIQUOTA_UF',
    label: 'Alíquota IBS por UF',
    description: 'Sobrescreve a alíquota IBS padrão para uma UF específica.',
    icon: 'map-pin',
    tone: 'accent',
    fields: ['uf', 'aliquota'],
    buildChave: (f) => `ibs.aliquota.uf.${(f.uf ?? '').toUpperCase()}`,
    buildValor: (f) => ({ aliquota: f.aliquota }),
    detectKind: (chave) => chave.startsWith('ibs.aliquota.uf.'),
    parseValor: (chave, valor) => {
      const v = asObj(valor);
      return {
        uf: chave.replace('ibs.aliquota.uf.', ''),
        aliquota: typeof v.aliquota === 'string' ? v.aliquota : String(v.aliquota ?? ''),
      };
    },
    renderValue: (valor) => {
      const v = asObj(valor);
      const aliq = typeof v.aliquota === 'string' ? v.aliquota : String(v.aliquota ?? '');
      return pct(aliq);
    },
  },
  {
    kind: 'IS_ALIQUOTA',
    label: 'Alíquota do Imposto Seletivo (IS)',
    description:
      'IS incide sobre produtos nocivos à saúde/ambiente (combustíveis, cigarros, bebidas). Defina a categoria.',
    icon: 'gauge',
    tone: 'warning',
    fields: ['categoria', 'aliquota'],
    buildChave: (f) => `is.aliquota.${(f.categoria ?? 'geral').toLowerCase()}`,
    buildValor: (f) => ({ aliquota: f.aliquota }),
    detectKind: (chave) => chave.startsWith('is.aliquota.'),
    parseValor: (chave, valor) => {
      const v = asObj(valor);
      return {
        categoria: chave.replace('is.aliquota.', ''),
        aliquota: typeof v.aliquota === 'string' ? v.aliquota : String(v.aliquota ?? ''),
      };
    },
    renderValue: (valor) => {
      const v = asObj(valor);
      const aliq = typeof v.aliquota === 'string' ? v.aliquota : String(v.aliquota ?? '');
      return pct(aliq);
    },
  },
  {
    kind: 'PIS_COFINS_ENCERRAMENTO',
    label: 'Encerramento do PIS/COFINS',
    description:
      'Data em que PIS e COFINS deixam de ser apurados (substituídos pela CBS). Padrão: 01/01/2027.',
    icon: 'calendar',
    tone: 'info',
    fields: ['data'],
    buildChave: () => 'pis_cofins.encerramento',
    buildValor: (f) => ({ dataExtincao: f.data }),
    detectKind: (chave) => chave === 'pis_cofins.encerramento',
    parseValor: (_chave, valor) => {
      const v = asObj(valor);
      const raw = typeof v.dataExtincao === 'string' ? v.dataExtincao : '';
      return { data: raw.slice(0, 10) };
    },
    renderValue: (valor) => {
      const v = asObj(valor);
      const raw = typeof v.dataExtincao === 'string' ? v.dataExtincao : '';
      if (!raw) return '—';
      try {
        return new Date(raw).toLocaleDateString('pt-BR');
      } catch {
        return raw;
      }
    },
  },
];

/** UFs disponíveis no select de "IBS por UF". */
export const UF_OPTIONS = UFS;

/** Categorias sugeridas pra IS — text input + datalist. */
export const IS_CATEGORIAS = ['combustivel', 'cigarro', 'bebida', 'veiculo'];

/**
 * Acha a definição do tipo a partir da chave persistida. Retorna `null` quando a chave
 * não bate com nenhum tipo conhecido (caso de parâmetros legados ou customizados).
 */
export function findParameterType(chave: string): ParameterTypeDefinition | null {
  return PARAMETER_TYPES.find((t) => t.detectKind(chave)) ?? null;
}

/** Estado inicial seguro pra um determinado kind. */
export function defaultFormState(kind: ParameterKind): ParameterFormState {
  switch (kind) {
    case 'IBS_ALIQUOTA_PADRAO':
    case 'CBS_ALIQUOTA_PADRAO':
      return { kind, aliquota: '', modo: 'ANO_TESTE' };
    case 'IBS_ALIQUOTA_UF':
      return { kind, uf: 'SP', aliquota: '' };
    case 'IS_ALIQUOTA':
      return { kind, categoria: 'combustivel', aliquota: '' };
    case 'PIS_COFINS_ENCERRAMENTO':
      return { kind, data: '2027-01-01' };
  }
}

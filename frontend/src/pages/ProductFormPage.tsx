import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { listCfops } from '@/features/cfops/cfops-api';
import { getNcm, listNcms } from '@/features/ncms/ncms-api';
import {
  createProduct,
  getProductWithTaxRules,
  replaceCurrentTaxRule,
  updateProduct,
  type ProductTaxRule,
} from '@/features/products/products-api';
import { ApiError } from '@/lib/api';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';
import {
  SearchCombobox,
  type ComboboxOption,
} from '@/shared/components/ui/SearchCombobox';

const LIST_PATH = '/cadastros/products';

const ORIGEM_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '0 — Nacional' },
  { value: 1, label: '1 — Estrangeira (importação direta)' },
  { value: 2, label: '2 — Estrangeira (mercado interno)' },
  { value: 3, label: '3 — Nacional, conteúdo importado > 40%' },
  { value: 4, label: '4 — Nacional (Lei de Informática)' },
  { value: 5, label: '5 — Nacional, conteúdo importado ≤ 40%' },
  { value: 6, label: '6 — Estrangeira sem similar nacional (importação direta)' },
  { value: 7, label: '7 — Estrangeira sem similar nacional (mercado interno)' },
  { value: 8, label: '8 — Nacional, conteúdo importado > 70%' },
];

const UNIDADES_SUGERIDAS = ['UN', 'PC', 'CX', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'M3', 'PCT', 'DZ', 'TON'];

// ───── Sources para os Combobox (NCM / CFOP) ─────

async function searchNcms(term: string): Promise<ComboboxOption[]> {
  const result = await listNcms({ search: term || undefined, apenasValidosNfe: true, limit: 50 });
  return result.data.map((n) => ({
    value: n.codigoSemPontos,
    label: `${n.codigo} — ${n.descricao}`,
    render: (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs font-semibold">{n.codigo}</span>
        <span className="text-xs text-muted-foreground line-clamp-2">{n.descricao}</span>
      </div>
    ),
  }));
}

async function loadNcm(codigo: string): Promise<ComboboxOption | null> {
  if (!codigo) return null;
  try {
    const n = await getNcm(codigo);
    return {
      value: n.codigoSemPontos,
      label: `${n.codigo} — ${n.descricao}`,
      render: (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs font-semibold">{n.codigo}</span>
          <span className="text-xs text-muted-foreground line-clamp-1">{n.descricao}</span>
        </div>
      ),
    };
  } catch {
    return { value: codigo, label: codigo };
  }
}

async function searchCfops(term: string, tipo: 'SAIDA' | 'ENTRADA'): Promise<ComboboxOption[]> {
  const items = await listCfops({ search: term || undefined, tipoOperacao: tipo, apenasAtivos: true });
  return items.map((c) => ({
    value: c.codigo,
    label: `${c.codigo} — ${c.descricao}`,
    render: (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs font-semibold">
          {c.codigo}{' '}
          <span className="ml-1 text-[10px] text-muted-foreground">
            {c.escopo === 'ESTADUAL' ? 'estadual' : c.escopo === 'INTERESTADUAL' ? 'interest.' : 'exterior'}
          </span>
        </span>
        <span className="text-xs text-muted-foreground line-clamp-2">{c.descricao}</span>
      </div>
    ),
  }));
}

async function loadCfop(codigo: string): Promise<ComboboxOption | null> {
  if (!codigo) return null;
  const matches = await listCfops({ search: codigo, apenasAtivos: false });
  const match = matches.find((c) => c.codigo === codigo);
  if (!match) return { value: codigo, label: codigo };
  return {
    value: match.codigo,
    label: `${match.codigo} — ${match.descricao}`,
    render: (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs font-semibold">{match.codigo}</span>
        <span className="text-xs text-muted-foreground line-clamp-1">{match.descricao}</span>
      </div>
    ),
  };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">{children}</div>
    </div>
  );
}

// =============================================================================
// Dispatcher
// =============================================================================

export function ProductFormPage(): React.ReactElement {
  const params = useParams({ strict: false }) as { id?: string };
  return params.id ? <EditProductForm productId={params.id} /> : <CreateProductForm />;
}

// =============================================================================
// Criar produto
// =============================================================================

interface CreateFormState {
  codigo: string;
  codigoBarras: string;
  descricao: string;
  ncm: string;
  cest: string;
  origem: number;
  unidadeComercial: string;
  unidadeTributavel: string;
  cfopPadraoSaida: string;
  cfopPadraoEntrada: string;
  pesoLiquido: string;
  pesoBruto: string;
  cstIcms: string;
  aliqIcms: string;
  cstIbsCbs: string;
  cClassTrib: string;
}

const CREATE_INITIAL: CreateFormState = {
  codigo: '',
  codigoBarras: '',
  descricao: '',
  ncm: '',
  cest: '',
  origem: 0,
  unidadeComercial: 'UN',
  unidadeTributavel: 'UN',
  cfopPadraoSaida: '5102',
  cfopPadraoEntrada: '1102',
  pesoLiquido: '',
  pesoBruto: '',
  cstIcms: '00',
  aliqIcms: '18.0000',
  cstIbsCbs: 'TRIBUTACAO_INTEGRAL',
  cClassTrib: '000001',
};

function CreateProductForm(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateFormState>(CREATE_INITIAL);

  function setField<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]): void {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function backToList(): void {
    void navigate({ to: LIST_PATH });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createProduct({
        codigo: form.codigo,
        codigoBarras: form.codigoBarras || null,
        descricao: form.descricao,
        ncm: form.ncm,
        cest: form.cest || null,
        origem: form.origem,
        unidadeComercial: form.unidadeComercial,
        unidadeTributavel: form.unidadeTributavel,
        cfopPadraoSaida: form.cfopPadraoSaida || null,
        cfopPadraoEntrada: form.cfopPadraoEntrada || null,
        pesoLiquido: form.pesoLiquido || null,
        pesoBruto: form.pesoBruto || null,
        initialTaxRule: {
          aliqIcms: form.aliqIcms,
          cstIcms: form.cstIcms,
          cstIbsCbs: form.cstIbsCbs,
          cClassTrib: form.cClassTrib,
          validFrom: new Date().toISOString(),
        },
      }),
    onSuccess: (p) => {
      toast.success(`Produto "${p.codigo}" cadastrado!`);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      backToList();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha ao criar produto'),
  });

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Novo produto"
        description="Cadastro com regra tributária inicial. Edição da regra tem fluxo versionado próprio."
        actions={
          <Button variant="outline" type="button" onClick={backToList}>
            Voltar
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.codigo || !form.descricao || !form.ncm) {
                toast.error('Código, descrição e NCM são obrigatórios.');
                return;
              }
              createMutation.mutate();
            }}
            className="space-y-5"
          >
            <Section title="Identificação">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Código <span className="text-destructive">*</span>
                  </Label>
                  <Input required value={form.codigo} onChange={(e) => setField('codigo', e.target.value)} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">GTIN/EAN (opcional)</Label>
                  <Input
                    value={form.codigoBarras}
                    onChange={(e) => setField('codigoBarras', e.target.value)}
                    placeholder="8 a 14 dígitos"
                    maxLength={14}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Descrição <span className="text-destructive">*</span>
                </Label>
                <Input required value={form.descricao} onChange={(e) => setField('descricao', e.target.value)} />
              </div>
            </Section>

            <Section title="Classificação fiscal">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  NCM <span className="text-destructive">*</span>
                </Label>
                <SearchCombobox
                  value={form.ncm}
                  onChange={(v) => setField('ncm', v)}
                  fetchOptions={searchNcms}
                  loadSelected={loadNcm}
                  placeholder="Buscar NCM por código ou descrição…"
                  emptyHint="Nenhum NCM encontrado. Verifique se o seed foi executado."
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">CEST (opcional)</Label>
                  <Input
                    value={form.cest}
                    onChange={(e) => setField('cest', e.target.value)}
                    placeholder="7 dígitos"
                    maxLength={7}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Origem da mercadoria <span className="text-destructive">*</span>
                  </Label>
                  <Select value={String(form.origem)} onChange={(e) => setField('origem', Number(e.target.value))}>
                    {ORIGEM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </Section>

            <Section
              title="CFOPs padrão (opcional)"
              description="Sugestões automáticas na emissão da NF-e. O sistema substitui 5xxx→6xxx ou 1xxx→2xxx quando a operação é interestadual."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">CFOP padrão de saída (vendas)</Label>
                  <SearchCombobox
                    value={form.cfopPadraoSaida}
                    onChange={(v) => setField('cfopPadraoSaida', v)}
                    fetchOptions={(t) => searchCfops(t, 'SAIDA')}
                    loadSelected={loadCfop}
                    placeholder="Buscar CFOP de saída…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CFOP padrão de entrada (compras)</Label>
                  <SearchCombobox
                    value={form.cfopPadraoEntrada}
                    onChange={(v) => setField('cfopPadraoEntrada', v)}
                    fetchOptions={(t) => searchCfops(t, 'ENTRADA')}
                    loadSelected={loadCfop}
                    placeholder="Buscar CFOP de entrada…"
                  />
                </div>
              </div>
            </Section>

            <Section title="Unidades e medidas">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Unidade comercial <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    required
                    list="unidades-sugeridas"
                    value={form.unidadeComercial}
                    onChange={(e) => setField('unidadeComercial', e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                  <datalist id="unidades-sugeridas">
                    {UNIDADES_SUGERIDAS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Unidade tributável <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    required
                    list="unidades-sugeridas"
                    value={form.unidadeTributavel}
                    onChange={(e) => setField('unidadeTributavel', e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Peso líquido (kg)</Label>
                  <Input value={form.pesoLiquido} onChange={(e) => setField('pesoLiquido', e.target.value)} placeholder="0.000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Peso bruto (kg)</Label>
                  <Input value={form.pesoBruto} onChange={(e) => setField('pesoBruto', e.target.value)} placeholder="0.000" />
                </div>
              </div>
            </Section>

            <Section
              title="Regra tributária inicial"
              description="Vigência a partir de hoje. Adicionais (ICMS-ST, IPI, retenções) entram via tela dedicada de regras."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">CST ICMS</Label>
                  <Input value={form.cstIcms} onChange={(e) => setField('cstIcms', e.target.value)} maxLength={4} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alíquota ICMS (%)</Label>
                  <Input value={form.aliqIcms} onChange={(e) => setField('aliqIcms', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CST IBS/CBS</Label>
                  <Input value={form.cstIbsCbs} onChange={(e) => setField('cstIbsCbs', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">cClassTrib</Label>
                  <Input value={form.cClassTrib} onChange={(e) => setField('cClassTrib', e.target.value)} />
                </div>
              </div>
            </Section>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" type="button" onClick={backToList} disabled={createMutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={createMutation.isPending}>
                Cadastrar produto
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

// =============================================================================
// Editar produto — Dados gerais + Regra tributária vigente (substitui os 2 modais)
// =============================================================================

type ImpostoMode = 'simples' | 'normal';

interface TaxRuleFormState {
  mode: ImpostoMode;
  csosnIcms: string;
  cstIcms: string;
  aliqIcms: string;
  cstPis: string;
  aliqPis: string;
  cstCofins: string;
  aliqCofins: string;
  cstIbsCbs: string;
  cClassTrib: string;
}

const EMPTY_TAX_FORM: TaxRuleFormState = {
  mode: 'simples',
  csosnIcms: '102',
  cstIcms: '00',
  aliqIcms: '18.0000',
  cstPis: '49',
  aliqPis: '0',
  cstCofins: '49',
  aliqCofins: '0',
  cstIbsCbs: 'TRIBUTACAO_INTEGRAL',
  cClassTrib: '000001',
};

function ruleToForm(rule: ProductTaxRule | undefined): TaxRuleFormState {
  if (!rule) return EMPTY_TAX_FORM;
  return {
    mode: rule.csosnIcms ? 'simples' : 'normal',
    csosnIcms: rule.csosnIcms ?? '102',
    cstIcms: rule.cstIcms ?? '00',
    aliqIcms: rule.aliqIcms ?? '18.0000',
    cstPis: rule.cstPis ?? '49',
    aliqPis: rule.aliqPis ?? '0',
    cstCofins: rule.cstCofins ?? '49',
    aliqCofins: rule.aliqCofins ?? '0',
    cstIbsCbs: rule.cstIbsCbs ?? 'TRIBUTACAO_INTEGRAL',
    cClassTrib: rule.cClassTrib ?? '000001',
  };
}

function EditProductForm({ productId }: { productId: string }): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailsQuery = useQuery({
    queryKey: ['product-with-tax-rules', productId],
    queryFn: () => getProductWithTaxRules(productId),
  });

  const [edit, setEdit] = useState({
    descricao: '',
    ncm: '',
    cest: '',
    origem: 0,
    unidadeComercial: 'UN',
    unidadeTributavel: 'UN',
    cfopPadraoSaida: '',
    cfopPadraoEntrada: '',
  });
  const [tax, setTax] = useState<TaxRuleFormState>(EMPTY_TAX_FORM);

  useEffect(() => {
    if (!detailsQuery.data) return;
    const p = detailsQuery.data.product;
    setEdit({
      descricao: p.descricao,
      ncm: p.ncm,
      cest: p.cest ?? '',
      origem: p.origem,
      unidadeComercial: p.unidadeComercial,
      unidadeTributavel: p.unidadeTributavel,
      cfopPadraoSaida: p.cfopPadraoSaida ?? '',
      cfopPadraoEntrada: p.cfopPadraoEntrada ?? '',
    });
    const now = Date.now();
    const active = detailsQuery.data.taxRules.find(
      (r) =>
        new Date(r.validFrom).getTime() <= now &&
        (!r.validTo || new Date(r.validTo).getTime() > now),
    );
    setTax(ruleToForm(active));
  }, [detailsQuery.data]);

  function backToList(): void {
    void navigate({ to: LIST_PATH });
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      updateProduct(productId, {
        descricao: edit.descricao,
        ncm: edit.ncm,
        cest: edit.cest || null,
        origem: edit.origem,
        unidadeComercial: edit.unidadeComercial,
        unidadeTributavel: edit.unidadeTributavel,
        cfopPadraoSaida: edit.cfopPadraoSaida || null,
        cfopPadraoEntrada: edit.cfopPadraoEntrada || null,
      }),
    onSuccess: (p) => {
      toast.success(`Produto "${p.codigo}" atualizado!`);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar produto'),
  });

  const replaceMutation = useMutation({
    mutationFn: () => {
      const isSimples = tax.mode === 'simples';
      return replaceCurrentTaxRule(productId, {
        csosnIcms: isSimples ? tax.csosnIcms : null,
        cstIcms: isSimples ? null : tax.cstIcms,
        aliqIcms: isSimples ? null : tax.aliqIcms,
        cstPis: tax.cstPis || null,
        aliqPis: tax.aliqPis || null,
        cstCofins: tax.cstCofins || null,
        aliqCofins: tax.aliqCofins || null,
        cstIbsCbs: tax.cstIbsCbs || null,
        cClassTrib: tax.cClassTrib || null,
      });
    },
    onSuccess: () => {
      toast.success('Regra tributária atualizada!');
      void queryClient.invalidateQueries({ queryKey: ['product-with-tax-rules', productId] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar regra'),
  });

  const codigo = detailsQuery.data?.product.codigo ?? '';

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Editar produto"
        description={codigo ? `Código ${codigo}` : 'Carregando…'}
        actions={
          <Button variant="outline" type="button" onClick={backToList}>
            Voltar
          </Button>
        }
      />

      {detailsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando produto…
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados gerais</CardTitle>
              <CardDescription>Código é imutável (vínculo com NF-e históricas).</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid grid-cols-2 gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateMutation.mutate();
                }}
              >
                <div className="col-span-2 space-y-1">
                  <Label>Descrição</Label>
                  <Input value={edit.descricao} onChange={(e) => setEdit((f) => ({ ...f, descricao: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>NCM (8 dígitos)</Label>
                  <Input
                    value={edit.ncm}
                    maxLength={8}
                    onChange={(e) => setEdit((f) => ({ ...f, ncm: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>CEST (7 dígitos, opcional)</Label>
                  <Input
                    value={edit.cest}
                    maxLength={7}
                    onChange={(e) => setEdit((f) => ({ ...f, cest: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Origem</Label>
                  <Select value={String(edit.origem)} onChange={(e) => setEdit((f) => ({ ...f, origem: Number(e.target.value) }))}>
                    {ORIGEM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Unidade comercial</Label>
                  <Input
                    value={edit.unidadeComercial}
                    maxLength={6}
                    onChange={(e) => setEdit((f) => ({ ...f, unidadeComercial: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Unidade tributável</Label>
                  <Input
                    value={edit.unidadeTributavel}
                    maxLength={6}
                    onChange={(e) => setEdit((f) => ({ ...f, unidadeTributavel: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>CFOP saída padrão</Label>
                  <Input
                    value={edit.cfopPadraoSaida}
                    maxLength={4}
                    onChange={(e) => setEdit((f) => ({ ...f, cfopPadraoSaida: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>CFOP entrada padrão</Label>
                  <Input
                    value={edit.cfopPadraoEntrada}
                    maxLength={4}
                    onChange={(e) => setEdit((f) => ({ ...f, cfopPadraoEntrada: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button type="submit" loading={updateMutation.isPending}>
                    Salvar dados gerais
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regra tributária vigente</CardTitle>
              <CardDescription>
                Salvar encerra a regra atual e abre uma nova vigente a partir de agora (histórico
                preservado).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  replaceMutation.mutate();
                }}
              >
                <div>
                  <Label>Regime ICMS</Label>
                  <div className="mt-1 flex gap-4 text-sm">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={tax.mode === 'simples'}
                        onChange={() => setTax((f) => ({ ...f, mode: 'simples' }))}
                      />
                      Simples Nacional (CSOSN)
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={tax.mode === 'normal'}
                        onChange={() => setTax((f) => ({ ...f, mode: 'normal' }))}
                      />
                      Regime Normal (CST)
                    </label>
                  </div>
                </div>

                {tax.mode === 'simples' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>CSOSN</Label>
                      <Select value={tax.csosnIcms} onChange={(e) => setTax((f) => ({ ...f, csosnIcms: e.target.value }))}>
                        <option value="101">101 — Tributada SN com permissão de crédito</option>
                        <option value="102">102 — Tributada SN sem permissão de crédito</option>
                        <option value="103">103 — Isenção do ICMS (faixa de receita)</option>
                        <option value="201">201 — Tributada SN com permissão + ICMS-ST</option>
                        <option value="202">202 — Tributada SN sem permissão + ICMS-ST</option>
                        <option value="500">500 — ICMS cobrado anteriormente por ST</option>
                        <option value="900">900 — Outros</option>
                      </Select>
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground">
                      No Simples Nacional, o ICMS NÃO é destacado na NF-e — vai como informativo no
                      CSOSN.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>CST ICMS</Label>
                      <Select value={tax.cstIcms} onChange={(e) => setTax((f) => ({ ...f, cstIcms: e.target.value }))}>
                        <option value="00">00 — Tributação integral</option>
                        <option value="10">10 — Tributada + ICMS-ST</option>
                        <option value="20">20 — Com redução de base</option>
                        <option value="30">30 — Isenta/não tributada + ICMS-ST</option>
                        <option value="40">40 — Isenta</option>
                        <option value="41">41 — Não tributada</option>
                        <option value="50">50 — Suspensão</option>
                        <option value="51">51 — Diferimento</option>
                        <option value="60">60 — ICMS cobrado anteriormente por ST</option>
                        <option value="70">70 — Com redução de base + ICMS-ST</option>
                        <option value="90">90 — Outros</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Alíquota ICMS (%)</Label>
                      <Input value={tax.aliqIcms} onChange={(e) => setTax((f) => ({ ...f, aliqIcms: e.target.value }))} placeholder="18.0000" />
                    </div>
                  </div>
                )}

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-semibold mb-2">PIS / COFINS</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label>CST PIS</Label>
                      <Input value={tax.cstPis} onChange={(e) => setTax((f) => ({ ...f, cstPis: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Alíq. PIS (%)</Label>
                      <Input value={tax.aliqPis} onChange={(e) => setTax((f) => ({ ...f, aliqPis: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>CST COFINS</Label>
                      <Input value={tax.cstCofins} onChange={(e) => setTax((f) => ({ ...f, cstCofins: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Alíq. COFINS (%)</Label>
                      <Input value={tax.aliqCofins} onChange={(e) => setTax((f) => ({ ...f, aliqCofins: e.target.value }))} />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Empresas do Simples Nacional usam CST 49 com alíquota 0 — pago via DAS.
                  </p>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-semibold mb-2">IBS / CBS (Reforma 2026+)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>CST IBS/CBS</Label>
                      <Select value={tax.cstIbsCbs} onChange={(e) => setTax((f) => ({ ...f, cstIbsCbs: e.target.value }))}>
                        <option value="TRIBUTACAO_INTEGRAL">000 — Tributação integral</option>
                        <option value="REDUCAO_ALIQUOTA">200 — Redução de alíquota</option>
                        <option value="REDUCAO_BASE_CALCULO">210 — Redução de base</option>
                        <option value="DIFERIMENTO">410 — Diferimento</option>
                        <option value="SUSPENSAO">510 — Suspensão</option>
                        <option value="ISENCAO">610 — Isenção</option>
                        <option value="IMUNIDADE">620 — Imunidade</option>
                        <option value="NAO_INCIDENCIA">630 — Não incidência</option>
                        <option value="CREDITO_PRESUMIDO">800 — Crédito presumido</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>cClassTrib</Label>
                      <Input value={tax.cClassTrib} onChange={(e) => setTax((f) => ({ ...f, cClassTrib: e.target.value }))} placeholder="000001" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" loading={replaceMutation.isPending}>
                    Salvar regra tributária
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  );
}

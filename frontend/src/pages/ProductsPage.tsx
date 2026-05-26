import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Loader2, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { listCfops } from '@/features/cfops/cfops-api';
import { getNcm, listNcms } from '@/features/ncms/ncms-api';
import {
  createProduct,
  deleteProduct,
  getProductWithTaxRules,
  listProducts,
  replaceCurrentTaxRule,
  updateProduct,
  type ProductTaxRule,
} from '@/features/products/products-api';
import { ApiError } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/AlertDialog';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { usePagination } from '@/shared/hooks/usePagination';
import type { Product } from '@/shared/types/fiscal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/Dialog';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';
import {
  SearchCombobox,
  type ComboboxOption,
} from '@/shared/components/ui/SearchCombobox';

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

interface FormState {
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
  // Regra tributária inicial (simplificada)
  cstIcms: string;
  aliqIcms: string;
  cstIbsCbs: string;
  cClassTrib: string;
}

const INITIAL: FormState = {
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
  cClassTrib: '100000',
};

export function ProductsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL);

  const pagination = usePagination({ initialPageSize: 50 });

  useEffect(() => {
    pagination.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, pagination.page, pagination.pageSize],
    queryFn: () =>
      listProducts({
        search: search || undefined,
        limit: pagination.pageSize,
        offset: pagination.offset,
      }),
    placeholderData: (prev) => prev,
  });

  // Estados de edição/exclusão. O modal de edição é focado nos campos editáveis
  // (descricao, ncm, unidades, origem, CFOPs) — código fica imutável e regra
  // tributária tem fluxo próprio com vigência versionada.
  const [editing, setEditing] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    descricao: '',
    ncm: '',
    cest: '',
    origem: 0,
    unidadeComercial: 'UN',
    unidadeTributavel: 'UN',
    cfopPadraoSaida: '',
    cfopPadraoEntrada: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // Modal de regra tributária — operação independente da edição básica do produto.
  const [taxRuleTarget, setTaxRuleTarget] = useState<Product | null>(null);

  function openEdit(p: Product): void {
    setEditing(p);
    setEditForm({
      descricao: p.descricao,
      ncm: p.ncm,
      cest: p.cest ?? '',
      origem: p.origem,
      unidadeComercial: p.unidadeComercial,
      unidadeTributavel: p.unidadeTributavel,
      cfopPadraoSaida: p.cfopPadraoSaida ?? '',
      cfopPadraoEntrada: p.cfopPadraoEntrada ?? '',
    });
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
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
      setForm(INITIAL);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Falha ao criar produto'),
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; payload: Parameters<typeof updateProduct>[1] }) =>
      updateProduct(params.id, params.payload),
    onSuccess: (p) => {
      toast.success(`Produto "${p.codigo}" atualizado!`);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar produto'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      toast.success(`Produto "${deleteTarget?.codigo}" excluído!`);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Falha ao excluir produto'),
  });

  // ───── Sources para os Combobox ─────

  async function searchNcms(term: string): Promise<ComboboxOption[]> {
    const result = await listNcms({
      search: term || undefined,
      apenasValidosNfe: true,
      limit: 50,
    });
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

  async function searchCfops(
    term: string,
    tipo: 'SAIDA' | 'ENTRADA',
  ): Promise<ComboboxOption[]> {
    const items = await listCfops({
      search: term || undefined,
      tipoOperacao: tipo,
      apenasAtivos: true,
    });
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
    // Busca exata no catálogo
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

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mercadorias com tributação versionada. NCM e CFOPs são puxados dos catálogos
            oficiais.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="primary" className="gap-2">
              <Plus className="h-4 w-4" />
              Novo produto
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Cadastrar produto</DialogTitle>
              <DialogDescription>
                Cadastro com regra tributária inicial. Edição completa via "Adicionar regra
                tributária" entra numa próxima iteração.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.codigo || !form.descricao || !form.ncm) {
                  toast.error('Código, descrição e NCM são obrigatórios.');
                  return;
                }
                createMutation.mutate();
              }}
              className="space-y-4"
            >
              {/* Identificação */}
              <Section title="Identificação">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Código <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      required
                      value={form.codigo}
                      onChange={(e) => setField('codigo', e.target.value)}
                    />
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
                  <Input
                    required
                    value={form.descricao}
                    onChange={(e) => setField('descricao', e.target.value)}
                  />
                </div>
              </Section>

              {/* Classificação fiscal */}
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
                    <Select
                      value={String(form.origem)}
                      onChange={(e) => setField('origem', Number(e.target.value))}
                    >
                      {ORIGEM_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </Section>

              {/* CFOPs padrão */}
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

              {/* Unidades */}
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
                    <Input
                      value={form.pesoLiquido}
                      onChange={(e) => setField('pesoLiquido', e.target.value)}
                      placeholder="0.000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Peso bruto (kg)</Label>
                    <Input
                      value={form.pesoBruto}
                      onChange={(e) => setField('pesoBruto', e.target.value)}
                      placeholder="0.000"
                    />
                  </div>
                </div>
              </Section>

              {/* Regra tributária inicial */}
              <Section
                title="Regra tributária inicial"
                description="Vigência a partir de hoje. Adicionais (ICMS-ST, IPI, retenções) entram via tela dedicada de regras."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">CST ICMS</Label>
                    <Input
                      value={form.cstIcms}
                      onChange={(e) => setField('cstIcms', e.target.value)}
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Alíquota ICMS (%)</Label>
                    <Input
                      value={form.aliqIcms}
                      onChange={(e) => setField('aliqIcms', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CST IBS/CBS</Label>
                    <Input
                      value={form.cstIbsCbs}
                      onChange={(e) => setField('cstIbsCbs', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">cClassTrib</Label>
                    <Input
                      value={form.cClassTrib}
                      onChange={(e) => setField('cClassTrib', e.target.value)}
                    />
                  </div>
                </div>
              </Section>

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-2"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Cadastrar produto'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm animate-fade-in" style={{ animationDelay: '50ms' }}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código ou descrição..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <Card className="p-10 text-center border-0 shadow-card text-sm text-muted-foreground animate-fade-in">
          Carregando produtos…
        </Card>
      ) : (data?.items?.length ?? 0) === 0 ? (
        <Card className="p-10 text-center border-0 shadow-card animate-fade-in">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium text-sm">
            {search ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado ainda.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
            {data!.items.map((p) => (
              <Card key={p.id} className="p-5 border-0 shadow-card hover:shadow-card-hover transition-all">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5 shrink-0">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{p.codigo}</p>
                    <h3 className="font-semibold text-foreground line-clamp-2">{p.descricao}</h3>
                  </div>
                  <div className="flex items-start gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setTaxRuleTarget(p)}
                      aria-label={`Editar regra tributária de ${p.codigo}`}
                      title="Regra tributária"
                    >
                      <Calculator className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(p)}
                      aria-label={`Editar ${p.codigo}`}
                      title="Dados gerais"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(p)}
                      aria-label={`Excluir ${p.codigo}`}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs">
                  <Row label="NCM" value={p.ncm} mono />
                  <Row label="Unidade" value={p.unidadeComercial} />
                  <Row label="Origem" value={String(p.origem)} />
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            total={data?.total ?? 0}
            page={pagination.page}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            isLoading={isLoading}
            className="pt-2"
          />
        </>
      )}

      <Modal
        open={editing !== null}
        title="Editar produto"
        description={`Código ${editing?.codigo ?? ''} — alterações na regra tributária têm fluxo próprio (com vigência versionada).`}
        onClose={() => setEditing(null)}
        onConfirm={() => {
          if (!editing) return;
          updateMutation.mutate({
            id: editing.id,
            payload: {
              descricao: editForm.descricao,
              ncm: editForm.ncm,
              cest: editForm.cest || null,
              origem: editForm.origem,
              unidadeComercial: editForm.unidadeComercial,
              unidadeTributavel: editForm.unidadeTributavel,
              cfopPadraoSaida: editForm.cfopPadraoSaida || null,
              cfopPadraoEntrada: editForm.cfopPadraoEntrada || null,
            },
          });
        }}
        confirmLabel="Salvar"
        loading={updateMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Descrição</Label>
            <Input
              value={editForm.descricao}
              onChange={(e) => setEditForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>NCM (8 dígitos)</Label>
            <Input
              value={editForm.ncm}
              maxLength={8}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, ncm: e.target.value.replace(/\D/g, '') }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>CEST (7 dígitos, opcional)</Label>
            <Input
              value={editForm.cest}
              maxLength={7}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, cest: e.target.value.replace(/\D/g, '') }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Origem</Label>
            <Select
              value={String(editForm.origem)}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, origem: Number(e.target.value) }))
              }
            >
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
              value={editForm.unidadeComercial}
              maxLength={6}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, unidadeComercial: e.target.value.toUpperCase() }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Unidade tributável</Label>
            <Input
              value={editForm.unidadeTributavel}
              maxLength={6}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, unidadeTributavel: e.target.value.toUpperCase() }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>CFOP saída padrão</Label>
            <Input
              value={editForm.cfopPadraoSaida}
              maxLength={4}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, cfopPadraoSaida: e.target.value.replace(/\D/g, '') }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>CFOP entrada padrão</Label>
            <Input
              value={editForm.cfopPadraoEntrada}
              maxLength={4}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  cfopPadraoEntrada: e.target.value.replace(/\D/g, ''),
                }))
              }
            />
          </div>
        </div>
      </Modal>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.codigo}</strong> — {deleteTarget?.descricao} será marcado
              como inativo. Itens já emitidos em NF-e não são afetados. A exclusão será rejeitada
              pelo backend caso exista regra tributária vigente ou futura para este produto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaxRuleModal
        product={taxRuleTarget}
        onClose={() => setTaxRuleTarget(null)}
        onSaved={() => {
          setTaxRuleTarget(null);
          // tax-simulate da NFeNewPage não cacheia por produto, mas invalidar não custa.
          void queryClient.invalidateQueries({ queryKey: ['products'] });
        }}
      />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// =============================================================================
// TaxRuleModal — edita a regra tributária VIGENTE do produto.
//
// O backend trata como "substituir": fecha a janela aberta (validTo = agora) e
// cria uma nova com os valores informados (validFrom = agora). Histórico fica
// preservado em product_tax_rules pra auditoria fiscal.
//
// UI mostra só os campos comuns; o esquema completo tem ~30 campos (ST, FCP, IPI
// por unidade, IS — caso especial) que ficam pra um modo "avançado" futuro.
// =============================================================================

type ImpostoMode = 'simples' | 'normal';

interface TaxRuleFormState {
  mode: ImpostoMode;
  // ICMS comum
  csosnIcms: string;
  cstIcms: string;
  aliqIcms: string;
  // PIS / COFINS (geralmente CST 49 = outras operações, alíquota 0 para SN)
  cstPis: string;
  aliqPis: string;
  cstCofins: string;
  aliqCofins: string;
  // IBS / CBS (Reforma) — defaults conservadores
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
  cClassTrib: '100000',
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
    cClassTrib: rule.cClassTrib ?? '100000',
  };
}

interface TaxRuleModalProps {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

function TaxRuleModal({ product, onClose, onSaved }: TaxRuleModalProps): React.ReactElement {
  const [form, setForm] = useState<TaxRuleFormState>(EMPTY_TAX_FORM);
  const open = product !== null;

  // Carrega a regra vigente sempre que o produto-alvo muda.
  const detailsQuery = useQuery({
    queryKey: ['product-with-tax-rules', product?.id],
    queryFn: () => getProductWithTaxRules(product!.id),
    enabled: open,
  });

  // Hidrata o form quando a regra chega do servidor.
  useEffect(() => {
    if (!detailsQuery.data) return;
    const now = Date.now();
    const active = detailsQuery.data.taxRules.find(
      (r) =>
        new Date(r.validFrom).getTime() <= now &&
        (!r.validTo || new Date(r.validTo).getTime() > now),
    );
    setForm(ruleToForm(active));
  }, [detailsQuery.data]);

  const replaceMutation = useMutation({
    mutationFn: () => {
      if (!product) throw new Error('Sem produto');
      // Monta o payload: só envia CSOSN ou CST conforme o modo selecionado.
      const isSimples = form.mode === 'simples';
      return replaceCurrentTaxRule(product.id, {
        csosnIcms: isSimples ? form.csosnIcms : null,
        cstIcms: isSimples ? null : form.cstIcms,
        aliqIcms: isSimples ? null : form.aliqIcms,
        cstPis: form.cstPis || null,
        aliqPis: form.aliqPis || null,
        cstCofins: form.cstCofins || null,
        aliqCofins: form.aliqCofins || null,
        cstIbsCbs: form.cstIbsCbs || null,
        cClassTrib: form.cClassTrib || null,
      });
    },
    onSuccess: () => {
      toast.success('Regra tributária atualizada!');
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar regra'),
  });

  return (
    <Modal
      open={open}
      title="Regra tributária"
      description={
        product
          ? `${product.codigo} — ${product.descricao}. Salvar encerra a regra atual e abre uma nova vigente a partir de agora.`
          : ''
      }
      onClose={onClose}
      onConfirm={() => replaceMutation.mutate()}
      confirmLabel="Salvar regra"
      loading={replaceMutation.isPending}
    >
      {detailsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando regra atual…
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Regime ICMS</Label>
            <div className="mt-1 flex gap-2 text-sm">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={form.mode === 'simples'}
                  onChange={() => setForm((f) => ({ ...f, mode: 'simples' }))}
                />
                Simples Nacional (CSOSN)
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={form.mode === 'normal'}
                  onChange={() => setForm((f) => ({ ...f, mode: 'normal' }))}
                />
                Regime Normal (CST)
              </label>
            </div>
          </div>

          {form.mode === 'simples' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CSOSN</Label>
                <Select
                  value={form.csosnIcms}
                  onChange={(e) => setForm((f) => ({ ...f, csosnIcms: e.target.value }))}
                >
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
                CSOSN. Para destacar valor de crédito ao cliente PJ, use CSOSN 101 e configure
                a alíquota de cálculo de crédito no faturamento.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CST ICMS</Label>
                <Select
                  value={form.cstIcms}
                  onChange={(e) => setForm((f) => ({ ...f, cstIcms: e.target.value }))}
                >
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
                <Input
                  value={form.aliqIcms}
                  onChange={(e) => setForm((f) => ({ ...f, aliqIcms: e.target.value }))}
                  placeholder="18.0000"
                />
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold mb-2">PIS / COFINS</h4>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>CST PIS</Label>
                <Input
                  value={form.cstPis}
                  onChange={(e) => setForm((f) => ({ ...f, cstPis: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Alíq. PIS (%)</Label>
                <Input
                  value={form.aliqPis}
                  onChange={(e) => setForm((f) => ({ ...f, aliqPis: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>CST COFINS</Label>
                <Input
                  value={form.cstCofins}
                  onChange={(e) => setForm((f) => ({ ...f, cstCofins: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Alíq. COFINS (%)</Label>
                <Input
                  value={form.aliqCofins}
                  onChange={(e) => setForm((f) => ({ ...f, aliqCofins: e.target.value }))}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Empresas do Simples Nacional usam CST 49 (outras operações) com alíquota 0 — PIS/
              COFINS é pago via DAS, sem destaque na nota.
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold mb-2">IBS / CBS (Reforma 2026+)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CST IBS/CBS</Label>
                <Select
                  value={form.cstIbsCbs}
                  onChange={(e) => setForm((f) => ({ ...f, cstIbsCbs: e.target.value }))}
                >
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
                <Input
                  value={form.cClassTrib}
                  onChange={(e) => setForm((f) => ({ ...f, cClassTrib: e.target.value }))}
                  placeholder="100000"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

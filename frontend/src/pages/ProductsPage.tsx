import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { listCfops } from '@/features/cfops/cfops-api';
import { getNcm, listNcms } from '@/features/ncms/ncms-api';
import { createProduct, listProducts } from '@/features/products/products-api';
import { ApiError } from '@/lib/api';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
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

  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts({ search: search || undefined, limit: 100 }),
  });

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
              </div>
              <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs">
                <Row label="NCM" value={p.ncm} mono />
                <Row label="Unidade" value={p.unidadeComercial} />
                <Row label="Origem" value={String(p.origem)} />
              </div>
            </Card>
          ))}
        </div>
      )}
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

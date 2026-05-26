import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  Search,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  listCfops,
  upsertCfop,
  type Cfop,
  type CfopEscopo,
  type CfopTipoOperacao,
  type UpsertCfopPayload,
} from '@/features/cfops/cfops-api';
import { ApiError } from '@/lib/api';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/Dialog';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';
import { Switch } from '@/shared/components/ui/Switch';

interface DialogState {
  open: boolean;
  editing?: Cfop;
}

interface FormState {
  codigo: string;
  descricao: string;
  grupo: string;
  geraCreditoPisCofins: boolean;
  ativo: boolean;
  observacoes: string;
}

const FORM_INITIAL: FormState = {
  codigo: '',
  descricao: '',
  grupo: '',
  geraCreditoPisCofins: false,
  ativo: true,
  observacoes: '',
};

export function CfopsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<CfopTipoOperacao | ''>('');
  const [escopoFilter, setEscopoFilter] = useState<CfopEscopo | ''>('');
  const [apenasCredito, setApenasCredito] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const { data: cfops = [], isLoading } = useQuery({
    queryKey: ['cfops', { search, tipoFilter, escopoFilter, apenasCredito }],
    queryFn: () =>
      listCfops({
        search: search || undefined,
        tipoOperacao: tipoFilter || undefined,
        escopo: escopoFilter || undefined,
        apenasGeraCredito: apenasCredito,
      }),
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">CFOPs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Códigos Fiscais de Operações e Prestações usados pelos itens da NF-e.
            {!isLoading && ` ${cfops.length} cadastrados.`}
          </p>
        </div>

        <Button
          variant="primary"
          className="gap-2"
          onClick={() => setDialog({ open: true })}
        >
          <Plus className="h-4 w-4" />
          Novo CFOP
        </Button>
      </div>

      {/* Filtros */}
      <div
        className="grid grid-cols-1 md:grid-cols-4 gap-3 animate-fade-in"
        style={{ animationDelay: '50ms' }}
      >
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, descrição ou grupo..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value as CfopTipoOperacao | '')}
        >
          <option value="">Todos os tipos</option>
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
        </Select>
        <Select
          value={escopoFilter}
          onChange={(e) => setEscopoFilter(e.target.value as CfopEscopo | '')}
        >
          <option value="">Todos os escopos</option>
          <option value="ESTADUAL">Estadual</option>
          <option value="INTERESTADUAL">Interestadual</option>
          <option value="EXTERIOR">Exterior</option>
        </Select>
      </div>

      <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-foreground animate-fade-in" style={{ animationDelay: '80ms' }}>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
          checked={apenasCredito}
          onChange={(e) => setApenasCredito(e.target.checked)}
        />
        Mostrar só operações que geram crédito PIS/COFINS
      </label>

      {/* Tabela */}
      {isLoading ? (
        <Card className="p-10 text-center border-0 shadow-card text-sm text-muted-foreground animate-fade-in">
          Carregando catálogo de CFOPs…
        </Card>
      ) : cfops.length === 0 ? (
        <Card className="p-10 text-center border-0 shadow-card animate-fade-in">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium text-sm">
            {search || tipoFilter || escopoFilter || apenasCredito
              ? 'Nenhum CFOP encontrado com esses filtros.'
              : 'Catálogo vazio. Rode o seed do backend para popular.'}
          </p>
        </Card>
      ) : (
        <Card className="border-0 shadow-card overflow-x-auto animate-fade-in" style={{ animationDelay: '200ms' }}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Código', 'Descrição', 'Tipo', 'Escopo', 'Grupo', 'PIS/COFINS', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cfops.map((c) => (
                <CfopRow key={c.id} cfop={c} onEdit={() => setDialog({ open: true, editing: c })} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <CfopDialog
        state={dialog}
        onClose={() => setDialog({ open: false })}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['cfops'] });
          setDialog({ open: false });
        }}
      />
    </div>
  );
}

function CfopRow({ cfop, onEdit }: { cfop: Cfop; onEdit: () => void }) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 font-mono font-semibold text-foreground">
        {cfop.codigo}
      </td>
      <td className="px-4 py-3 text-foreground max-w-md">
        <div className="line-clamp-2">{cfop.descricao}</div>
        {!cfop.ativo && (
          <span className="inline-block mt-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
            INATIVO
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <TipoBadge tipo={cfop.tipoOperacao} />
      </td>
      <td className="px-4 py-3">
        <EscopoBadge escopo={cfop.escopo} />
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{cfop.grupo ?? '—'}</td>
      <td className="px-4 py-3 text-center">
        {cfop.geraCreditoPisCofins ? (
          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Editar CFOP"
          aria-label="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function TipoBadge({ tipo }: { tipo: CfopTipoOperacao }) {
  if (tipo === 'ENTRADA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info">
        <ArrowDownLeft className="h-3 w-3" /> ENTRADA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
      <ArrowUpRight className="h-3 w-3" /> SAÍDA
    </span>
  );
}

function EscopoBadge({ escopo }: { escopo: CfopEscopo }) {
  const config = {
    ESTADUAL: { label: 'Estadual', cls: 'bg-muted text-foreground' },
    INTERESTADUAL: { label: 'Interestadual', cls: 'bg-accent-soft text-accent' },
    EXTERIOR: { label: 'Exterior', cls: 'bg-warning-soft text-warning-foreground' },
  } as const;
  const c = config[escopo];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${c.cls}`}>
      <Globe2 className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function CfopDialog({
  state,
  onClose,
  onSaved,
}: {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = state.editing;
  const [form, setForm] = useState<FormState>(FORM_INITIAL);

  useEffect(() => {
    if (!state.open) return;
    if (editing) {
      setForm({
        codigo: editing.codigo,
        descricao: editing.descricao,
        grupo: editing.grupo ?? '',
        geraCreditoPisCofins: editing.geraCreditoPisCofins,
        ativo: editing.ativo,
        observacoes: editing.observacoes ?? '',
      });
    } else {
      setForm(FORM_INITIAL);
    }
  }, [state.open, editing]);

  const { mutate: salvar, isPending } = useMutation({
    mutationFn: upsertCfop,
    onSuccess: () => {
      toast.success(editing ? 'CFOP atualizado!' : 'CFOP cadastrado!');
      onSaved();
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Erro ao salvar CFOP.';
      toast.error(msg);
    },
  });

  // Deriva tipo/escopo na hora do preview (mesma lógica do backend).
  const preview = derivarTipoEscopo(form.codigo);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[123567]\d{3}$/.test(form.codigo)) {
      toast.error('Código CFOP inválido. Use 4 dígitos começando com 1/2/3/5/6/7.');
      return;
    }
    if (form.descricao.trim().length < 3) {
      toast.error('Descrição é obrigatória.');
      return;
    }
    const payload: UpsertCfopPayload = {
      codigo: form.codigo,
      descricao: form.descricao.trim(),
      grupo: form.grupo.trim() || null,
      geraCreditoPisCofins: form.geraCreditoPisCofins,
      ativo: form.ativo,
      observacoes: form.observacoes.trim() || null,
    };
    salvar(payload);
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar CFOP' : 'Novo CFOP'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Atualize a descrição, grupo ou flags. Código não pode ser alterado.'
              : 'Tipo (entrada/saída) e escopo (estadual/interestadual/exterior) são derivados automaticamente do primeiro dígito do código.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">
                Código CFOP <span className="text-destructive">*</span>
              </Label>
              <Input
                required
                maxLength={4}
                placeholder="5102"
                value={form.codigo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, codigo: e.target.value.replace(/\D/g, '') }))
                }
                disabled={!!editing}
              />
              {preview && (
                <p className="text-xs text-muted-foreground">
                  → {preview.tipo} · {preview.escopo}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Grupo / categoria</Label>
              <Input
                placeholder="Vendas, Transferências..."
                value={form.grupo}
                onChange={(e) => setForm((p) => ({ ...p, grupo: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">
              Descrição <span className="text-destructive">*</span>
            </Label>
            <Input
              required
              maxLength={500}
              placeholder="Venda de mercadoria adquirida ou recebida de terceiros"
              value={form.descricao}
              onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Observações (opcional)</Label>
            <textarea
              rows={2}
              maxLength={2000}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring"
              placeholder="Notas de uso, restrições, observações da equipe fiscal..."
              value={form.observacoes}
              onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <ToggleRow
              label="Gera crédito de PIS/COFINS"
              description="Marque se esta operação dá direito a crédito no regime não-cumulativo."
              checked={form.geraCreditoPisCofins}
              onChange={(v) => setForm((p) => ({ ...p, geraCreditoPisCofins: v }))}
            />
            <ToggleRow
              label="Ativo"
              description="Desative para sinalizar código revogado ou em desuso."
              checked={form.ativo}
              onChange={(v) => setForm((p) => ({ ...p, ativo: v }))}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full mt-2"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Salvando…
              </>
            ) : editing ? (
              'Atualizar CFOP'
            ) : (
              'Cadastrar CFOP'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function derivarTipoEscopo(
  codigo: string,
): { tipo: string; escopo: string } | null {
  if (!/^[123567]\d{3}$/.test(codigo)) return null;
  const p = codigo[0];
  if (p === '1') return { tipo: 'Entrada', escopo: 'Estadual' };
  if (p === '2') return { tipo: 'Entrada', escopo: 'Interestadual' };
  if (p === '3') return { tipo: 'Entrada', escopo: 'Exterior' };
  if (p === '5') return { tipo: 'Saída', escopo: 'Estadual' };
  if (p === '6') return { tipo: 'Saída', escopo: 'Interestadual' };
  return { tipo: 'Saída', escopo: 'Exterior' };
}

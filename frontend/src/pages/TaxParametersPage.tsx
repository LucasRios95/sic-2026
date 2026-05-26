import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Calculator,
  Gauge,
  Loader2,
  MapPin,
  Pencil,
  Percent,
  Plus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  defaultFormState,
  findParameterType,
  IS_CATEGORIAS,
  PARAMETER_TYPES,
  UF_OPTIONS,
  type ParameterFormState,
  type ParameterKind,
  type ParameterTypeDefinition,
} from '@/features/tax/parameter-types';
import {
  listTaxParameters,
  upsertTaxParameter,
  type TaxParameter,
} from '@/features/tax/tax-api';
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

const ICONS = {
  percent: Percent,
  'map-pin': MapPin,
  calendar: Calendar,
  gauge: Gauge,
} as const;

const TONE_BG: Record<ParameterTypeDefinition['tone'], string> = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/10 text-accent',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
};

interface DialogState {
  open: boolean;
  /** Quando preenchido, é edição. Senão é criação. */
  editing?: TaxParameter;
}

export function TaxParametersPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const { data: parameters = [], isLoading } = useQuery({
    queryKey: ['tax-parameters'],
    queryFn: () => listTaxParameters('all'),
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Parâmetros tributários
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Alíquotas IBS, CBS, IS e datas de transição consumidas pelo motor de cálculo.
          </p>
        </div>

        <Button variant="primary" className="gap-2" onClick={() => setDialog({ open: true })}>
          <Plus className="h-4 w-4" />
          Novo parâmetro
        </Button>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : parameters.length === 0 ? (
        <EmptyState onCreate={() => setDialog({ open: true })} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parameters.map((p, i) => (
            <ParameterCard
              key={p.id}
              param={p}
              delay={i * 60}
              onEdit={() => setDialog({ open: true, editing: p })}
            />
          ))}
        </div>
      )}

      <ParameterDialog
        state={dialog}
        onClose={() => setDialog({ open: false })}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['tax-parameters'] });
          setDialog({ open: false });
        }}
      />
    </div>
  );
}

function ParameterCard({
  param,
  delay,
  onEdit,
}: {
  param: TaxParameter;
  delay: number;
  onEdit: () => void;
}) {
  const type = findParameterType(param.chave);
  const tone = type?.tone ?? 'info';
  const Icon = type ? ICONS[type.icon] : Calculator;
  const label = type?.label ?? param.chave;
  const valueText = type ? type.renderValue(param.valor) : '—';

  return (
    <Card
      className="p-5 border-0 shadow-card hover:shadow-card-hover transition-all animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`rounded-xl p-2.5 shrink-0 ${TONE_BG[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          <ScopeBadge isGlobal={param.companyId === null} />
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Editar parâmetro"
            aria-label="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="font-display text-2xl font-bold text-foreground">{valueText}</p>
      </div>
      <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs">
        <Row label="Vigência" value={formatRange(param.validFrom, param.validTo)} />
        {param.fonteNorma && <Row label="Fonte" value={param.fonteNorma} />}
      </div>
    </Card>
  );
}

function ScopeBadge({ isGlobal }: { isGlobal: boolean }) {
  return (
    <span
      className={
        isGlobal
          ? 'rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-info'
          : 'rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-accent'
      }
    >
      {isGlobal ? 'Global' : 'Empresa'}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium truncate">{value}</span>
    </div>
  );
}

function ParameterDialog({
  state,
  onClose,
  onSaved,
}: {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = state.editing;

  const [form, setForm] = useState<ParameterFormState>(() => defaultFormState('IBS_ALIQUOTA_PADRAO'));
  const [scope, setScope] = useState<'global' | 'company'>('global');
  const [validFrom, setValidFrom] = useState<string>(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState<string>('');
  const [fonteNorma, setFonteNorma] = useState<string>('');

  // Quando o dialog abre/fecha ou editing muda, sincroniza o estado interno
  useEffect(() => {
    if (!state.open) return;
    if (editing) {
      const type = findParameterType(editing.chave);
      if (type) {
        const parsed = type.parseValor(editing.chave, editing.valor);
        setForm({ ...defaultFormState(type.kind), ...parsed });
      } else {
        setForm(defaultFormState('IBS_ALIQUOTA_PADRAO'));
      }
      setScope(editing.companyId ? 'company' : 'global');
      setValidFrom(editing.validFrom.slice(0, 10));
      setValidTo(editing.validTo ? editing.validTo.slice(0, 10) : '');
      setFonteNorma(editing.fonteNorma ?? '');
    } else {
      setForm(defaultFormState('IBS_ALIQUOTA_PADRAO'));
      setScope('global');
      setValidFrom(new Date().toISOString().slice(0, 10));
      setValidTo('');
      setFonteNorma('');
    }
  }, [state.open, editing]);

  function changeKind(kind: ParameterKind) {
    setForm(defaultFormState(kind));
  }

  const currentType = PARAMETER_TYPES.find((t) => t.kind === form.kind)!;

  const { mutate: salvar, isPending } = useMutation({
    mutationFn: upsertTaxParameter,
    onSuccess: () => {
      toast.success(editing ? 'Parâmetro atualizado!' : 'Parâmetro criado!');
      onSaved();
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Erro ao salvar parâmetro.';
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (currentType.fields.includes('aliquota') && !form.aliquota) {
      toast.error('Informe a alíquota.');
      return;
    }
    if (currentType.fields.includes('uf') && !form.uf) {
      toast.error('Selecione a UF.');
      return;
    }
    if (currentType.fields.includes('data') && !form.data) {
      toast.error('Informe a data.');
      return;
    }
    if (currentType.fields.includes('categoria') && !form.categoria) {
      toast.error('Informe a categoria.');
      return;
    }
    salvar({
      chave: currentType.buildChave(form),
      valor: currentType.buildValor(form),
      fonteNorma: fonteNorma || null,
      validFrom: new Date(validFrom).toISOString(),
      validTo: validTo ? new Date(validTo).toISOString() : null,
      scope,
    });
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Editar parâmetro' : 'Novo parâmetro tributário'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Atualize alíquota ou vigência. O motor usa o novo valor a partir da data informada.'
              : 'Escolha o tipo e preencha os campos. O sistema cuida do resto.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">
              Tipo do parâmetro <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.kind}
              onChange={(e) => changeKind(e.target.value as ParameterKind)}
              disabled={!!editing}
            >
              {PARAMETER_TYPES.map((t) => (
                <option key={t.kind} value={t.kind}>
                  {t.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{currentType.description}</p>
          </div>

          <KindFields
            type={currentType}
            form={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">
                Vigência início <span className="text-destructive">*</span>
              </Label>
              <Input
                required
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Vigência fim</Label>
              <Input
                type="date"
                placeholder="Em vigor"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Escopo</Label>
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'global' | 'company')}
              disabled={!!editing}
            >
              <option value="global">Global (todas as empresas)</option>
              <option value="company">Apenas a empresa atual</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Fonte normativa</Label>
            <Input
              placeholder="RT 2025.002, NT 007/2026..."
              value={fonteNorma}
              onChange={(e) => setFonteNorma(e.target.value)}
            />
          </div>

          <Button type="submit" variant="primary" className="w-full mt-2" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Salvando…
              </>
            ) : editing ? (
              'Atualizar parâmetro'
            ) : (
              'Salvar parâmetro'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KindFields({
  type,
  form,
  onChange,
}: {
  type: ParameterTypeDefinition;
  form: ParameterFormState;
  onChange: (patch: Partial<ParameterFormState>) => void;
}) {
  return (
    <div className="space-y-3">
      {type.fields.includes('uf') && (
        <div className="space-y-2">
          <Label className="text-xs">
            UF <span className="text-destructive">*</span>
          </Label>
          <Select value={form.uf ?? ''} onChange={(e) => onChange({ uf: e.target.value })}>
            {UF_OPTIONS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </div>
      )}

      {type.fields.includes('categoria') && (
        <div className="space-y-2">
          <Label className="text-xs">
            Categoria <span className="text-destructive">*</span>
          </Label>
          <Input
            list="is-categorias"
            value={form.categoria ?? ''}
            onChange={(e) => onChange({ categoria: e.target.value.toLowerCase() })}
            placeholder="combustivel, cigarro, bebida..."
          />
          <datalist id="is-categorias">
            {IS_CATEGORIAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      )}

      {type.fields.includes('aliquota') && (
        <div className="space-y-2">
          <Label className="text-xs">
            Alíquota (%) <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              required
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="0,00"
              value={form.aliquota ?? ''}
              onChange={(e) => onChange({ aliquota: e.target.value })}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              %
            </span>
          </div>
        </div>
      )}

      {type.fields.includes('modo') && (
        <div className="space-y-2">
          <Label className="text-xs">
            Modo de cobrança <span className="text-destructive">*</span>
          </Label>
          <Select
            value={form.modo ?? 'ANO_TESTE'}
            onChange={(e) => onChange({ modo: e.target.value as 'ANO_TESTE' | 'PLENO' })}
          >
            <option value="ANO_TESTE">Ano-teste (destaque sem recolhimento)</option>
            <option value="PLENO">Pleno (recolhimento real)</option>
          </Select>
        </div>
      )}

      {type.fields.includes('data') && (
        <div className="space-y-2">
          <Label className="text-xs">
            Data <span className="text-destructive">*</span>
          </Label>
          <Input
            required
            type="date"
            value={form.data ?? ''}
            onChange={(e) => onChange({ data: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-16 text-muted-foreground animate-fade-in">
      <Calculator className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">Nenhum parâmetro tributário cadastrado.</p>
      <p className="text-sm mt-1 mb-4">
        O seed inicial popula as alíquotas IBS/CBS. Se não vir nada, rode{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run seed</code> no backend.
      </p>
      <Button variant="primary" onClick={onCreate} className="gap-2">
        <Plus className="h-4 w-4" />
        Cadastrar primeiro parâmetro
      </Button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-5 border-0 shadow-card">
          <div className="h-11 w-11 rounded-xl bg-muted animate-pulse" />
          <div className="mt-3 space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
            <div className="h-7 bg-muted animate-pulse rounded w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function formatRange(from: string, to: string | null): string {
  const f = new Date(from).toLocaleDateString('pt-BR');
  const t = to ? new Date(to).toLocaleDateString('pt-BR') : 'em vigor';
  return `${f} → ${t}`;
}

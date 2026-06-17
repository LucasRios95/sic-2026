import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Calendar, Calculator, Gauge, MapPin, Pencil, Percent, Plus } from 'lucide-react';

import { findParameterType, type ParameterTypeDefinition } from '@/features/tax/parameter-types';
import { listTaxParameters, type TaxParameter } from '@/features/tax/tax-api';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';

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

export function TaxParametersPage(): React.ReactElement {
  const navigate = useNavigate();

  const { data: parameters = [], isLoading } = useQuery({
    queryKey: ['tax-parameters'],
    queryFn: () => listTaxParameters('all'),
  });

  function goNew(): void {
    void navigate({ to: '/admin/tax-params/new' });
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Parâmetros tributários"
        description="Alíquotas IBS, CBS, IS e datas de transição consumidas pelo motor de cálculo."
        actions={
          <Button variant="primary" className="gap-2" onClick={goNew}>
            <Plus className="h-4 w-4" />
            Novo parâmetro
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonGrid />
      ) : parameters.length === 0 ? (
        <EmptyState onCreate={goNew} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parameters.map((p) => (
            <ParameterCard
              key={p.id}
              param={p}
              onEdit={() => void navigate({ to: '/admin/tax-params/$id/edit', params: { id: p.id } })}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function ParameterCard({ param, onEdit }: { param: TaxParameter; onEdit: () => void }): React.ReactElement {
  const type = findParameterType(param.chave);
  const tone = type?.tone ?? 'info';
  const Icon = type ? ICONS[type.icon] : Calculator;
  const label = type?.label ?? param.chave;
  const valueText = type ? type.renderValue(param.valor) : '—';

  return (
    <Card className="p-5 border-0 shadow-card hover:shadow-card-hover transition-all">
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

function ScopeBadge({ isGlobal }: { isGlobal: boolean }): React.ReactElement {
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

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium truncate">{value}</span>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }): React.ReactElement {
  return (
    <div className="text-center py-16 text-muted-foreground">
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

function SkeletonGrid(): React.ReactElement {
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  createCompany,
  listCompanies,
  type Company,
} from '@/features/companies/companies-api';
import {
  COMPANY_FORM_INITIAL,
  CompanyForm,
  companyFormToPayload,
  type CompanyFormState,
} from '@/features/companies/CompanyForm';
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

const CRT_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  SIMPLES_EXCESSO_RECEITA: 'Simples — excesso',
  REGIME_NORMAL: 'Regime Normal',
  MEI: 'MEI',
};

export function CompaniesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CompanyFormState>(COMPANY_FORM_INITIAL);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: listCompanies,
  });

  const { mutate: criar, isPending: criando } = useMutation({
    mutationFn: createCompany,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success(`Empresa "${created.razaoSocial}" cadastrada!`);
      setForm(COMPANY_FORM_INITIAL);
      setCreateOpen(false);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Erro ao cadastrar empresa.';
      toast.error(msg);
    },
  });

  function setField<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cnpj || !form.razaoSocial || !form.uf || !form.municipio) {
      toast.error('CNPJ, Razão Social, UF e Município são obrigatórios.');
      return;
    }
    criar(companyFormToPayload(form));
  }

  const filtered = companies.filter((c) => {
    const term = search.toLowerCase();
    const onlyDigits = search.replace(/\D/g, '');
    return (
      c.razaoSocial.toLowerCase().includes(term) ||
      (onlyDigits && c.cnpj.includes(onlyDigits)) ||
      (c.nomeFantasia?.toLowerCase().includes(term) ?? false)
    );
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isLoading
              ? 'Carregando…'
              : `${companies.length} empresa${companies.length !== 1 ? 's' : ''} cadastrada${companies.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="primary" className="gap-2">
              <Plus className="h-4 w-4" />
              Nova empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Cadastrar empresa</DialogTitle>
              <DialogDescription>
                Informe os dados fiscais da empresa emissora. Campos com * são obrigatórios.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <CompanyForm form={form} setField={setField} disabled={criando} />
              <Button
                type="submit"
                variant="primary"
                className="w-full mt-6"
                disabled={criando}
              >
                {criando ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Salvar empresa'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CNPJ..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <EmptyState search={search} onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((company, i) => (
            <CompanyCard key={company.id} company={company} delay={i * 60} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyCard({ company, delay }: { company: Company; delay: number }) {
  return (
    <Card
      className="p-5 border-0 shadow-card hover:shadow-card-hover transition-all cursor-pointer group animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-xl bg-primary/10 p-2.5 shrink-0">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {company.razaoSocial}
            </h3>
            {company.nomeFantasia && (
              <p className="text-xs text-muted-foreground truncate">{company.nomeFantasia}</p>
            )}
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {formatCNPJ(company.cnpj)}
            </p>
          </div>
        </div>
        <EnvBadge env={company.ambienteSefaz} />
      </div>

      <div className="mt-4 space-y-1.5 text-sm">
        <Row label="UF / Município" value={`${company.uf} · ${company.municipio}`} />
        <Row label="Regime" value={CRT_LABEL[company.crt] ?? company.crt} />
      </div>

      <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-1">
        {company.usaIcms && <FlagPill label="ICMS" />}
        {company.usaIcmsSt && <FlagPill label="ICMS-ST" />}
        {company.usaIpi && <FlagPill label="IPI" />}
        {company.usaDifal && <FlagPill label="DIFAL" />}
        {company.usaFcp && <FlagPill label="FCP" />}
        {company.usaIcmsDesonerado && <FlagPill label="ICMS desonerado" />}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground truncate text-right">{value}</span>
    </div>
  );
}

function EnvBadge({ env }: { env: string }) {
  const isProd = env === 'PRODUCAO';
  return (
    <span
      className={
        isProd
          ? 'inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground shrink-0'
          : 'inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-warning-foreground shrink-0'
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isProd ? 'bg-white' : 'bg-warning'}`} />
      {isProd ? 'Produção' : 'Homolog.'}
    </span>
  );
}

function FlagPill({ label }: { label: string }) {
  return (
    <span className="rounded-md bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info">
      {label}
    </span>
  );
}

function EmptyState({ search, onCreate }: { search: string; onCreate: () => void }) {
  return (
    <div className="text-center py-16 text-muted-foreground animate-fade-in">
      <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">
        {search
          ? 'Nenhuma empresa encontrada para essa busca.'
          : 'Nenhuma empresa cadastrada ainda.'}
      </p>
      {!search && (
        <>
          <p className="text-sm mt-1 mb-4">
            Cadastre a primeira empresa emissora para começar a emitir NF-e.
          </p>
          <Button variant="primary" onClick={onCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Cadastrar primeira empresa
          </Button>
        </>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-5 border-0 shadow-card">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-muted animate-pulse h-11 w-11" />
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
              <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 bg-muted animate-pulse rounded w-full" />
            <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function formatCNPJ(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

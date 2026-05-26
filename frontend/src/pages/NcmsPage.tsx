import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileText, Info, Search, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { listNcms, type Ncm } from '@/features/ncms/ncms-api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Pagination } from '@/shared/components/ui/Pagination';
import { usePagination } from '@/shared/hooks/usePagination';

const NIVEL_LABEL: Record<number, string> = {
  2: 'Capítulo',
  4: 'Posição',
  5: 'Sub-posição',
  6: 'Sub-posição',
  7: 'Item',
  8: 'NCM (8 dígitos)',
};

const NIVEL_COLOR: Record<number, string> = {
  2: 'bg-muted text-foreground',
  4: 'bg-info-soft text-info',
  5: 'bg-info-soft text-info',
  6: 'bg-info-soft text-info',
  7: 'bg-accent-soft text-accent',
  8: 'bg-primary-soft text-primary',
};

export function NcmsPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const [apenasNfe, setApenasNfe] = useState(true);
  const pagination = usePagination({ initialPageSize: 50 });

  useEffect(() => {
    pagination.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, apenasNfe]);

  const { data, isLoading } = useQuery({
    queryKey: ['ncms', { search, apenasNfe }, pagination.page, pagination.pageSize],
    queryFn: () =>
      listNcms({
        search: search || undefined,
        apenasValidosNfe: apenasNfe,
        limit: pagination.pageSize,
        offset: pagination.offset,
      }),
    placeholderData: (prev) => prev,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="animate-fade-in space-y-1">
        <h1 className="font-display text-2xl font-bold text-foreground">NCMs</h1>
        <p className="text-muted-foreground text-sm">
          Nomenclatura Comum do Mercosul — catálogo oficial CAMEX. Catálogo read-only
          atualizado via seed quando há nova Resolução.
        </p>
      </div>

      {/* Info banner */}
      <Card
        className="p-4 border-info/30 bg-info/5 flex items-start gap-3 animate-fade-in"
        style={{ animationDelay: '50ms' }}
      >
        <Info className="h-4 w-4 text-info mt-0.5 shrink-0" />
        <div className="text-xs text-info-foreground space-y-1">
          <p>
            Apenas NCMs de <strong>8 dígitos</strong> (nível "NCM completo") são válidos
            no XML da NF-e. Capítulos, posições e sub-posições são nós de hierarquia
            usados pra navegação.
          </p>
          <p>
            Cadastro de produtos valida automaticamente o código contra este catálogo.
          </p>
        </div>
      </Card>

      {/* Filtros */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in"
        style={{ animationDelay: '100ms' }}
      >
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou descrição..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
            checked={apenasNfe}
            onChange={(e) => setApenasNfe(e.target.checked)}
          />
          <span className="text-sm text-foreground">Só NCMs válidos pra NF-e</span>
        </label>
      </div>

      {/* Lista */}
      {isLoading ? (
        <Card className="p-10 text-center border-0 shadow-card text-sm text-muted-foreground animate-fade-in">
          Buscando NCMs…
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center border-0 shadow-card animate-fade-in">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium text-sm">
            {search
              ? 'Nenhum NCM encontrado com esse termo.'
              : 'Catálogo vazio. Rode o seed no backend para popular as ~15k entradas oficiais.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((ncm, i) => (
              <NcmCard key={ncm.id} ncm={ncm} delay={i * 30} />
            ))}
          </div>

          <Pagination
            total={total}
            page={pagination.page}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            isLoading={isLoading}
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}

function NcmCard({ ncm, delay }: { ncm: Ncm; delay: number }) {
  return (
    <Card
      className="p-4 border-0 shadow-card hover:shadow-card-hover transition-all animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-semibold text-foreground">
              {ncm.codigo}
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${NIVEL_COLOR[ncm.nivel] ?? 'bg-muted text-foreground'}`}
            >
              {NIVEL_LABEL[ncm.nivel] ?? `Nível ${ncm.nivel}`}
            </span>
            {ncm.validoParaNfe ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-success">
                <CheckCircle2 className="h-3 w-3" /> NF-e
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <XCircle className="h-3 w-3" /> hierarquia
              </span>
            )}
          </div>
          <p className="text-sm text-foreground line-clamp-2">{ncm.descricao}</p>
          {(ncm.ato || ncm.dataInicio) && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {ncm.ato && <span>{ncm.ato}</span>}
              {ncm.dataInicio && (
                <span>· Vigente desde {formatDate(ncm.dataInicio)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function formatDate(s: string): string {
  try {
    const [ano, mes, dia] = s.split('-');
    return `${dia}/${mes}/${ano}`;
  } catch {
    return s;
  }
}

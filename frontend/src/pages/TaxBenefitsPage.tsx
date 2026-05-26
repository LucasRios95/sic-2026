import { useQuery } from '@tanstack/react-query';
import { Calculator, Info } from 'lucide-react';
import { useState } from 'react';

import { listBeneficios, type TipoBeneficio } from '@/features/tax/tax-api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';

const TIPO_LABEL: Record<TipoBeneficio, string> = {
  ISENCAO: 'Isenção',
  REDUCAO_BASE: 'Redução de base',
  REDUCAO_ALIQUOTA: 'Redução de alíquota',
  CREDITO_PRESUMIDO: 'Crédito presumido',
  DIFERIMENTO: 'Diferimento',
};

const TIPO_TONE: Record<
  TipoBeneficio,
  { bg: string; text: string }
> = {
  ISENCAO: { bg: 'bg-success-soft', text: 'text-success' },
  REDUCAO_BASE: { bg: 'bg-info-soft', text: 'text-info' },
  REDUCAO_ALIQUOTA: { bg: 'bg-info-soft', text: 'text-info' },
  CREDITO_PRESUMIDO: { bg: 'bg-accent-soft', text: 'text-accent' },
  DIFERIMENTO: { bg: 'bg-warning-soft', text: 'text-warning-foreground' },
};

export function TaxBenefitsPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['beneficios-fiscais'],
    queryFn: listBeneficios,
  });

  const filtered = items.filter((b) => {
    const term = search.toLowerCase();
    return (
      b.uf.toLowerCase().includes(term) ||
      (b.ncm && b.ncm.includes(search)) ||
      b.codBeneficio.toLowerCase().includes(term) ||
      b.descricao.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="animate-fade-in space-y-1">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Benefícios fiscais por UF
        </h1>
        <p className="text-muted-foreground text-sm">
          Isenções, reduções de base e diferimentos por UF + NCM. O motor seleciona o
          benefício específico (com NCM) antes do genérico (NCM nulo) e aplica
          automaticamente.
        </p>
      </div>

      <Card
        className="p-4 border-info/30 bg-info/5 flex items-start gap-3 animate-fade-in"
        style={{ animationDelay: '50ms' }}
      >
        <Info className="h-4 w-4 text-info mt-0.5 shrink-0" />
        <div className="text-xs text-info-foreground">
          O <strong>código do benefício</strong> (<code>cBenef</code>) vai no XML da NF-e
          quando o item é beneficiado. Para benefícios de isenção/redução com desoneração,
          o motor preenche <code>motDesICMS</code> + <code>vICMSDeson</code>
          automaticamente. Edição via SQL/seed nesta versão.
        </div>
      </Card>

      <div className="max-w-sm animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Input
          placeholder="Buscar por UF, NCM, código ou descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center border-0 shadow-card animate-fade-in">
          <Calculator className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium text-sm">
            {search ? 'Nenhum benefício encontrado.' : 'Nenhum benefício cadastrado ainda.'}
          </p>
          {!search && (
            <p className="text-xs text-muted-foreground mt-1">
              Alimente <code>beneficios_fiscais_uf</code> conforme demanda por UF/produto.
            </p>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((b, i) => {
            const tone = TIPO_TONE[b.tipo];
            return (
              <Card
                key={b.id}
                className="p-5 border-0 shadow-card hover:shadow-card-hover transition-all animate-fade-in"
                style={{ animationDelay: `${(i + 3) * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      {b.uf}
                    </span>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {b.codBeneficio}
                    </span>
                  </div>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${tone.bg} ${tone.text}`}
                  >
                    {TIPO_LABEL[b.tipo] ?? b.tipo}
                  </span>
                </div>
                <p className="mt-2 text-sm text-foreground line-clamp-2">{b.descricao}</p>
                <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs">
                  {b.ncm && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NCM</span>
                      <span className="font-mono text-foreground">{b.ncm}</span>
                    </div>
                  )}
                  {b.percentual && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Percentual</span>
                      <span className="text-foreground font-semibold">
                        {formatPct(b.percentual)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vigência</span>
                    <span className="text-foreground">
                      {new Date(b.validFrom).toLocaleDateString('pt-BR')} →{' '}
                      {b.validTo
                        ? new Date(b.validTo).toLocaleDateString('pt-BR')
                        : 'em vigor'}
                    </span>
                  </div>
                  {b.fonteNorma && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fonte</span>
                      <span className="text-foreground truncate">{b.fonteNorma}</span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatPct(raw: string): string {
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  return (
    num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '%'
  );
}

import { useQuery } from '@tanstack/react-query';
import { Calculator, Info } from 'lucide-react';
import { useState } from 'react';

import { listIcmsStMva } from '@/features/tax/tax-api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';

export function IcmsStMvaPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['icms-st-mva'],
    queryFn: listIcmsStMva,
  });

  const filtered = items.filter((m) => {
    const term = search.toLowerCase();
    return (
      m.ufOrigem.toLowerCase().includes(term) ||
      m.ufDestino.toLowerCase().includes(term) ||
      m.ncm.includes(search) ||
      (m.descricao?.toLowerCase().includes(term) ?? false)
    );
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="animate-fade-in space-y-1">
        <h1 className="font-display text-2xl font-bold text-foreground">
          MVA — Margem de Valor Agregado (ICMS-ST)
        </h1>
        <p className="text-muted-foreground text-sm">
          Margem cadastrada por (UF origem, UF destino, NCM) usada pela calculadora de
          Substituição Tributária. MVA ajustada (Conv. 35/2011) pré-calculada por alíquota
          interestadual (4% importado, 7%, 12%).
        </p>
      </div>

      <Card
        className="p-4 border-info/30 bg-info/5 flex items-start gap-3 animate-fade-in"
        style={{ animationDelay: '50ms' }}
      >
        <Info className="h-4 w-4 text-info mt-0.5 shrink-0" />
        <div className="text-xs text-info-foreground">
          Alimentar conforme protocolos Confaz vigentes. Quando não há MVA cadastrada aqui, o
          motor cai para o <code>pMVAST</code> da própria <code>ProductTaxRule</code>. Edição
          via SQL/seed nesta versão.
        </div>
      </Card>

      <div className="max-w-sm animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Input
          placeholder="Buscar por UF, NCM ou segmento..."
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
            {search ? 'Nenhuma MVA encontrada.' : 'Nenhuma MVA cadastrada ainda.'}
          </p>
          {!search && (
            <p className="text-xs text-muted-foreground mt-1">
              Alimente <code>icms_st_mva</code> via seed conforme convênios Confaz aplicáveis.
            </p>
          )}
        </Card>
      ) : (
        <Card
          className="border-0 shadow-card overflow-x-auto animate-fade-in"
          style={{ animationDelay: '200ms' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {[
                  'Rota (origem → destino)',
                  'NCM / Segmento',
                  'MVA original',
                  'MVA ajustada (4% / 7% / 12%)',
                  'Protocolo',
                  'Vigência',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <UfPill uf={m.ufOrigem} /> → <UfPill uf={m.ufDestino} />
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-mono text-xs text-foreground">{m.ncm}</div>
                    {m.descricao && (
                      <div className="text-xs text-muted-foreground">{m.descricao}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 font-semibold text-foreground">
                    {formatPct(m.mvaOriginal)}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    <div className="flex gap-2 flex-wrap">
                      <Adj label="4%" value={m.mvaAjustada4} />
                      <Adj label="7%" value={m.mvaAjustada7} />
                      <Adj label="12%" value={m.mvaAjustada12} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {m.protocolo ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {new Date(m.validFrom).toLocaleDateString('pt-BR')} →{' '}
                    {m.validTo ? new Date(m.validTo).toLocaleDateString('pt-BR') : 'em vigor'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function UfPill({ uf }: { uf: string }) {
  return (
    <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">
      {uf}
    </span>
  );
}

function Adj({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
        {label} <span className="opacity-50">—</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-info-soft px-2 py-0.5 text-info">
      {label} <strong>{formatPct(value)}</strong>
    </span>
  );
}

function formatPct(raw: string): string {
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  return (
    num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '%'
  );
}

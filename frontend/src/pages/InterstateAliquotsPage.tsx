import { useQuery } from '@tanstack/react-query';
import { Calculator, Info } from 'lucide-react';
import { useState } from 'react';

import { listInterstateAliquots } from '@/features/tax/tax-api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

export function InterstateAliquotsPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const { data: aliquots = [], isLoading } = useQuery({
    queryKey: ['interstate-aliquots'],
    queryFn: listInterstateAliquots,
  });

  // Indexa por (origem, destino) para lookup rápido na matriz.
  const matrix = new Map<string, { nacional: string; importado: string }>();
  for (const a of aliquots) {
    matrix.set(`${a.ufOrigem}-${a.ufDestino}`, {
      nacional: formatAliq(a.aliqNacional),
      importado: formatAliq(a.aliqImportado),
    });
  }

  const filteredUfs = search
    ? UFS.filter((uf) => uf.toLowerCase().includes(search.toLowerCase()))
    : UFS;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="animate-fade-in space-y-1">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Alíquotas interestaduais
        </h1>
        <p className="text-muted-foreground text-sm">
          Matriz origem→destino consumida pelo motor (`interstate_aliquots`). Senado 22/89 +
          Resolução 13/2012 (importados). Read-only — atualização raríssima via seed.
        </p>
      </div>

      <Card className="p-4 border-info/30 bg-info/5 flex items-start gap-3 animate-fade-in" style={{ animationDelay: '50ms' }}>
        <Info className="h-4 w-4 text-info mt-0.5 shrink-0" />
        <div className="text-xs text-info-foreground">
          <strong>Nacional</strong>: produto/serviço sem similar importado (7% no eixo
          N/NE/CO + ES, 12% no S/SE).<br />
          <strong>Importado</strong>: 4% para mercadoria com conteúdo de importação ≥ 40%
          (Resolução do Senado 13/2012).
        </div>
      </Card>

      <div className="max-w-sm animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Input
          placeholder="Filtrar UF..."
          value={search}
          onChange={(e) => setSearch(e.target.value.toUpperCase())}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando matriz…</p>
      ) : aliquots.length === 0 ? (
        <Card className="p-10 text-center border-0 shadow-card">
          <Calculator className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm text-muted-foreground">
            Tabela vazia. Rode <code>npm run seed</code> no backend para popular.
          </p>
        </Card>
      ) : (
        <Card className="border-0 shadow-card overflow-auto animate-fade-in" style={{ animationDelay: '200ms' }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-muted-foreground sticky left-0 bg-muted/80 z-10">
                  De ↓ / Para →
                </th>
                {filteredUfs.map((uf) => (
                  <th
                    key={uf}
                    className="px-2 py-2 text-center font-semibold text-muted-foreground min-w-[60px]"
                  >
                    {uf}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUfs.map((origem) => (
                <tr key={origem} className="border-t border-border hover:bg-muted/30">
                  <th className="px-2 py-1.5 text-left font-semibold text-foreground sticky left-0 bg-background z-10">
                    {origem}
                  </th>
                  {filteredUfs.map((destino) => {
                    const cell = matrix.get(`${origem}-${destino}`);
                    if (origem === destino) {
                      return (
                        <td key={destino} className="px-2 py-1.5 text-center text-muted-foreground/50">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={destino} className="px-2 py-1.5 text-center">
                        {cell ? (
                          <div className="space-y-0.5">
                            <div className="text-foreground font-medium">{cell.nacional}%</div>
                            <div className="text-[10px] text-info">{cell.importado}%</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">?</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/** Converte "12.0000" → "12" e "20.5000" → "20,5". */
function formatAliq(raw: string): string {
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}


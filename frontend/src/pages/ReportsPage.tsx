import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  downloadReportCsv,
  getReport,
  type ReportType,
} from '@/features/reports/reports-api';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';

const REPORTS: Array<{ type: ReportType; label: string; description: string }> = [
  {
    type: 'faturamento',
    label: 'Faturamento',
    description: 'Vendas autorizadas por cliente e CFOP.',
  },
  {
    type: 'apuracao',
    label: 'Apuração',
    description: 'Totais de ICMS, ST, IPI, PIS, COFINS, IBS, CBS e IS.',
  },
  {
    type: 'entradas',
    label: 'Entradas',
    description: 'Documentos recebidos por fornecedor e status.',
  },
  {
    type: 'rankings',
    label: 'Rankings',
    description: 'Produtos e clientes por valor no período.',
  },
];

export function ReportsPage(): React.ReactElement {
  const [type, setType] = useState<ReportType>('faturamento');
  const [fromDate, setFromDate] = useState(firstDayOfMonth());
  const [toDate, setToDate] = useState(today());

  const from = useMemo(() => new Date(`${fromDate}T00:00:00`).toISOString(), [fromDate]);
  const to = useMemo(() => new Date(`${toDate}T23:59:59`).toISOString(), [toDate]);

  const query = useQuery({
    queryKey: ['report', type, from, to],
    queryFn: () => getReport({ type, from, to }),
  });

  const rows = query.data?.rows ?? [];
  const headers = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
    [rows],
  );

  async function handleCsv(): Promise<void> {
    try {
      await downloadReportCsv({ type, from, to });
    } catch {
      toast.error('Falha ao exportar CSV.');
    }
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Relatórios"
        description="Consultas fiscais e comerciais por período, usando os documentos já gravados no sistema."
        actions={
          <Button variant="outline" onClick={() => void handleCsv()} disabled={rows.length === 0}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />

      <Card className="border-0 p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {REPORTS.map((report) => (
              <button
                key={report.type}
                type="button"
                onClick={() => setType(report.type)}
                className={`rounded-md border p-3 text-left transition-colors ${
                  type === report.type
                    ? 'border-primary bg-primary-soft text-foreground'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart3 className="h-4 w-4" />
                  {report.label}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {report.description}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">De</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(query.data?.totals ?? {}).map(([key, value]) => (
          <Card key={key} className="border-0 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">{labelize(key)}</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">
              {formatValue(key, value)}
            </p>
          </Card>
        ))}
      </div>

      <Card className="border-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {REPORTS.find((report) => report.type === type)?.label}
            </h2>
            <p className="text-xs text-muted-foreground">{rows.length} linha(s)</p>
          </div>
          <Badge className="bg-muted text-muted-foreground">
            {new Date(from).toLocaleDateString('pt-BR')} a{' '}
            {new Date(to).toLocaleDateString('pt-BR')}
          </Badge>
        </div>

        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando relatório...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum dado encontrado para o período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {labelize(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, index) => (
                  <tr key={index} className="hover:bg-muted/30">
                    {headers.map((header) => (
                      <td key={header} className="px-4 py-3 text-foreground">
                        {formatValue(header, row[header])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}

function firstDayOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function labelize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function formatValue(key: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const asNumber = Number(value);
  if (
    !Number.isNaN(asNumber) &&
    /valor|base|total/i.test(key) &&
    !/participacao/i.test(key)
  ) {
    return asNumber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (!Number.isNaN(asNumber) && /participacao/i.test(key)) return `${value}%`;
  return String(value);
}

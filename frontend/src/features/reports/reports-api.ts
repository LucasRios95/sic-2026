import { env } from '@/env';
import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api';

function companyOrThrow(): string {
  const id = useAuthStore.getState().selectedCompanyId;
  if (!id) throw new Error('Empresa não selecionada');
  return id;
}

export type ReportType = 'faturamento' | 'apuracao' | 'entradas' | 'rankings';

export interface ReportResponse {
  type: ReportType;
  from: string;
  to: string;
  totals: Record<string, string | number>;
  rows: Array<Record<string, string | number | null>>;
}

export async function getReport(input: {
  type: ReportType;
  from: string;
  to: string;
}): Promise<ReportResponse> {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  return api<ReportResponse>(`/reports/${input.type}?${params.toString()}`, {
    method: 'GET',
    companyId: companyOrThrow(),
  });
}

export async function downloadReportCsv(input: {
  type: ReportType;
  from: string;
  to: string;
}): Promise<void> {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    format: 'csv',
  });
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${env.apiBaseUrl}/reports/${input.type}?${params.toString()}`, {
    headers: {
      Accept: 'text/csv',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Company-Id': companyOrThrow(),
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `${input.type}-${input.from.slice(0, 10)}-${input.to.slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(href);
}

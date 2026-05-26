import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowDownLeft,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { listCertificates } from '@/features/certificates/certificates-api';
import { ManifestDialog } from '@/features/recepcao/ManifestDialog';
import {
  listReceivedDocuments,
  syncRecebidos,
  type ReceivedDocument,
  type ReceivedDocumentStatus,
} from '@/features/recepcao/recepcao-api';
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
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';

const STATUS_LABEL: Record<ReceivedDocumentStatus, string> = {
  PENDENTE: 'Pendente',
  CONFERIDO: 'Conferido',
  ESCRITURADO: 'Escriturado',
  DEVOLVIDO: 'Devolvido',
};

const STATUS_TONE: Record<
  ReceivedDocumentStatus,
  { bg: string; text: string }
> = {
  PENDENTE: { bg: 'bg-warning-soft', text: 'text-warning-foreground' },
  CONFERIDO: { bg: 'bg-info-soft', text: 'text-info' },
  ESCRITURADO: { bg: 'bg-success-soft', text: 'text-success' },
  DEVOLVIDO: { bg: 'bg-destructive-soft', text: 'text-destructive' },
};

export function InboxRecebidosPage(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<ReceivedDocumentStatus | ''>('');
  const [search, setSearch] = useState('');
  const [manifestOpen, setManifestOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ReceivedDocument | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  const query = useQuery({
    queryKey: ['received-documents', { statusFilter }],
    queryFn: () =>
      listReceivedDocuments({
        status: statusFilter || undefined,
        limit: 200,
      }),
  });

  const items = query.data?.items ?? [];

  // Filtra no client por busca textual (CNPJ ou nome do emitente).
  const filtered = items.filter((d) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const cnpj = d.emitenteCnpj.replace(/\D/g, '');
    const searchDigits = search.replace(/\D/g, '');
    return (
      d.emitenteNome.toLowerCase().includes(term) ||
      (searchDigits && cnpj.includes(searchDigits)) ||
      d.chaveAcesso?.includes(searchDigits)
    );
  });

  function openManifest(doc: ReceivedDocument) {
    setSelectedDoc(doc);
    setManifestOpen(true);
  }

  function abrirDetalhes(doc: ReceivedDocument) {
    navigate({ to: '/fiscal/recebidos/$id', params: { id: doc.id } });
  }

  // Stats no header
  const stats = {
    pendentes: items.filter((d) => d.status === 'PENDENTE').length,
    conferidos: items.filter((d) => d.status === 'CONFERIDO').length,
    escriturados: items.filter((d) => d.status === 'ESCRITURADO').length,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Inbox de Notas Recebidas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            DF-e emitidos contra o CNPJ desta empresa (NF-e modelo 55 inicialmente).
            Sincronizado periodicamente com a SEFAZ via Distribuição DF-e.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar lista
          </Button>
          <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
            <DialogTrigger asChild>
              <Button variant="primary" className="gap-2">
                <ArrowDownLeft className="h-4 w-4" />
                Sincronizar SEFAZ
              </Button>
            </DialogTrigger>
            <SyncDialogContent
              onClose={() => setSyncOpen(false)}
              onSynced={() => {
                void queryClient.invalidateQueries({ queryKey: ['received-documents'] });
                setSyncOpen(false);
              }}
            />
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in"
        style={{ animationDelay: '50ms' }}
      >
        <StatCard
          label="Pendentes de manifestação"
          value={stats.pendentes}
          icon={AlertCircle}
          tone="warning"
        />
        <StatCard
          label="Conferidos"
          value={stats.conferidos}
          icon={CheckCircle2}
          tone="info"
        />
        <StatCard
          label="Escriturados"
          value={stats.escriturados}
          icon={FileText}
          tone="success"
        />
      </div>

      {/* Filtros */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in"
        style={{ animationDelay: '100ms' }}
      >
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por emitente, CNPJ ou chave de acesso…"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as ReceivedDocumentStatus | '')
          }
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as ReceivedDocumentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {/* Lista */}
      {query.isLoading ? (
        <Card className="p-10 text-center border-0 shadow-card text-sm text-muted-foreground animate-fade-in">
          Carregando notas recebidas…
        </Card>
      ) : query.isError ? (
        <Card className="p-10 text-center border-0 shadow-card animate-fade-in">
          <AlertCircle className="h-10 w-10 mx-auto mb-2 text-destructive opacity-60" />
          <p className="font-medium text-sm">Erro ao carregar notas recebidas.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Verifique se o backend está rodando e se a empresa está selecionada.
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border-0 shadow-card animate-fade-in">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">
            {search || statusFilter
              ? 'Nenhuma nota encontrada com esses filtros.'
              : 'Nenhuma nota recebida ainda.'}
          </p>
          {!search && !statusFilter && (
            <>
              <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
                Clique em <strong>Sincronizar SEFAZ</strong> para buscar manualmente, ou
                aguarde o worker rodar (a cada 30 minutos por padrão).
              </p>
              <Button variant="primary" onClick={() => setSyncOpen(true)} className="gap-2">
                <ArrowDownLeft className="h-4 w-4" />
                Sincronizar agora
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card
          className="border-0 shadow-card overflow-x-auto animate-fade-in"
          style={{ animationDelay: '200ms' }}
        >
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[
                  'Emitente',
                  'Documento',
                  'Emissão',
                  'Valor',
                  'Status',
                  'Captura',
                  'Ações',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((doc) => (
                <tr
                  key={doc.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => abrirDetalhes(doc)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground truncate max-w-xs">
                      {doc.emitenteNome}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {formatCnpj(doc.emitenteCnpj)} ·{' '}
                      <span className="font-semibold">{doc.emitenteUf ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="font-mono text-xs">
                      {doc.numero ?? '—'}/{doc.serie ?? '—'}
                    </div>
                    {doc.chaveAcesso && (
                      <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">
                        {doc.chaveAcesso}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(doc.dhEmissao).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {formatMoney(doc.valorTotal)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {OrigemLabel[doc.origemCaptura] ?? doc.origemCaptura}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openManifest(doc);
                      }}
                    >
                      Manifestar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ManifestDialog
        open={manifestOpen}
        onClose={() => setManifestOpen(false)}
        document={selectedDoc}
      />
    </div>
  );
}

const OrigemLabel: Record<string, string> = {
  sefaz_distribuicao: 'SEFAZ',
  focus_nfsen: 'Focus NFS-e',
  upload_xml: 'Upload XML',
  upload_pdf: 'Upload PDF',
};

function SyncDialogContent({
  onClose,
  onSynced,
}: {
  onClose: () => void;
  onSynced: () => void;
}): React.ReactElement {
  const [certificateVaultRef, setCertificateVaultRef] = useState('');
  const certificatesQuery = useQuery({
    queryKey: ['certificates'],
    queryFn: listCertificates,
  });
  const ativos = certificatesQuery.data?.filter((c) => c.active) ?? [];

  const mutation = useMutation({
    mutationFn: () => syncRecebidos({ certificateVaultRef, maxIterations: 10 }),
    onSuccess: (result) => {
      toast.success(
        `${result.capturedDocs} documento${result.capturedDocs !== 1 ? 's' : ''} capturado${result.capturedDocs !== 1 ? 's' : ''} em ${result.iterations} iteração${result.iterations !== 1 ? 'ões' : ''}.`,
      );
      onSynced();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao sincronizar.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!certificateVaultRef) {
      toast.error('Selecione o certificado A1 antes de sincronizar.');
      return;
    }
    mutation.mutate();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Sincronizar com SEFAZ</DialogTitle>
        <DialogDescription>
          Dispara uma consulta imediata ao serviço Distribuição DF-e da SEFAZ. Cada
          execução baixa até 50 documentos novos. O worker faz isso automaticamente em
          background — use só quando o operador quer reconsultar imediatamente.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">
            Certificado A1 <span className="text-destructive">*</span>
          </Label>
          <Select
            value={certificateVaultRef}
            onChange={(e) => setCertificateVaultRef(e.target.value)}
          >
            <option value="">Selecione o certificado…</option>
            {ativos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.alias} (vence {new Date(c.validTo).toLocaleDateString('pt-BR')})
              </option>
            ))}
          </Select>
          {ativos.length === 0 && (
            <p className="text-xs text-destructive">
              Nenhum certificado A1 ativo. Cadastre um antes.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={mutation.isPending || !certificateVaultRef || ativos.length === 0}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Sincronizando…
              </>
            ) : (
              'Sincronizar agora'
            )}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'warning' | 'info' | 'success';
}) {
  const cls = {
    warning: 'bg-warning-soft text-warning-foreground',
    info: 'bg-info-soft text-info',
    success: 'bg-success-soft text-success',
  }[tone];
  return (
    <Card className="p-5 border-0 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-3xl font-bold text-foreground mt-1">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${cls}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: ReceivedDocumentStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone.bg} ${tone.text}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatMoney(v: string): string {
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Workaround: Link/Dialog import enxergados via JSX abaixo. Não precisamos do Link
// direto aqui, mas mantemos referência para futuras melhorias de navegação.
void Link;

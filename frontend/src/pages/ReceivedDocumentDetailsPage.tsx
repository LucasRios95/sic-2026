import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  History,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ManifestDialog } from '@/features/recepcao/ManifestDialog';
import {
  getReceivedDocument,
  type DfeManifestationView,
  type ReceivedDocumentStatus,
  type TipoDFe,
  type TipoManifestacao,
} from '@/features/recepcao/recepcao-api';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';

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

const TIPO_DFE_LABEL: Record<TipoDFe, string> = {
  NFE_55: 'NF-e (mod. 55)',
  NFCE_65: 'NFC-e (mod. 65)',
  NFSE_MUNICIPAL: 'NFS-e Municipal',
  NFSE_NACIONAL: 'NFS-e Nacional',
  CTE_57: 'CT-e (mod. 57)',
  CTE_67_OS: 'CT-e OS (mod. 67)',
  MDFE_58: 'MDF-e (mod. 58)',
  NFCOM: 'NFCom',
  DCE: 'DC-e',
};

const TIPO_MANIFESTACAO_LABEL: Record<TipoManifestacao, string> = {
  CIENCIA_OPERACAO: 'Ciência da operação',
  CONFIRMACAO_OPERACAO: 'Confirmação da operação',
  DESCONHECIMENTO_OPERACAO: 'Desconhecimento da operação',
  OPERACAO_NAO_REALIZADA: 'Operação não realizada',
};

const ORIGEM_LABEL: Record<string, string> = {
  sefaz_distribuicao: 'SEFAZ — Distribuição DF-e',
  focus_nfsen: 'Focus NFS-e',
  upload_xml: 'Upload manual de XML',
  upload_pdf: 'Upload manual de PDF',
};

export function ReceivedDocumentDetailsPage(): React.ReactElement {
  const { id } = useParams({ from: '/fiscal/recebidos/$id' });
  const navigate = useNavigate();
  const [manifestOpen, setManifestOpen] = useState(false);

  const query = useQuery({
    queryKey: ['received-document', id],
    queryFn: () => getReceivedDocument(id),
  });

  if (query.isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <Card className="p-10 text-center border-0 shadow-card text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin opacity-60" />
          Carregando documento…
        </Card>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-4">
        <BackButton onClick={() => navigate({ to: '/fiscal/recebidos' })} />
        <Card className="p-10 text-center border-0 shadow-card">
          <AlertCircle className="h-10 w-10 mx-auto mb-2 text-destructive opacity-60" />
          <p className="font-medium text-sm">Documento não encontrado.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Pode ter sido removido ou pertencer a outra empresa.
          </p>
        </Card>
      </div>
    );
  }

  const { document, manifestations } = query.data;
  const xmlDisponivel = !!document.xmlCompleto;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <BackButton onClick={() => navigate({ to: '/fiscal/recebidos' })} />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 animate-fade-in">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-foreground">
              {TIPO_DFE_LABEL[document.tipo] ?? document.tipo}
              {document.numero ? ` nº ${document.numero}` : ''}
              {document.serie ? ` · Série ${document.serie}` : ''}
            </h1>
            <StatusBadge status={document.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Emitido por <strong className="text-foreground">{document.emitenteNome}</strong>{' '}
            ({formatCnpj(document.emitenteCnpj)}
            {document.emitenteUf ? ` · ${document.emitenteUf}` : ''})
          </p>
          {document.chaveAcesso && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(document.chaveAcesso!);
                toast.success('Chave de acesso copiada.');
              }}
              className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 -mx-2 text-[11px] font-mono text-muted-foreground hover:bg-muted/50 transition-colors"
              title="Copiar chave de acesso"
            >
              {document.chaveAcesso}
              <ClipboardCopy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <Button variant="primary" onClick={() => setManifestOpen(true)}>
            Manifestar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: '50ms' }}>
        <InfoCard
          label="Valor total"
          value={formatMoney(document.valorTotal)}
          icon={FileText}
          tone="primary"
        />
        <InfoCard
          label="Emissão"
          value={new Date(document.dhEmissao).toLocaleString('pt-BR')}
          icon={CalendarClock}
          tone="info"
        />
        <InfoCard
          label="Capturado em"
          value={new Date(document.capturedAt).toLocaleString('pt-BR')}
          icon={Building2}
          tone="default"
          sub={ORIGEM_LABEL[document.origemCaptura] ?? document.origemCaptura}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-card p-6 space-y-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Emitente
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Field label="Razão social" value={document.emitenteNome} />
              <Field label="CNPJ" value={formatCnpj(document.emitenteCnpj)} mono />
              <Field label="UF" value={document.emitenteUf ?? '—'} />
              <Field
                label="Fornecedor vinculado"
                value={
                  document.supplierId ? (
                    <Link
                      to="/cadastros/customers"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Ver cadastro
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Não vinculado</span>
                  )
                }
              />
            </dl>
          </Card>

          <Card className="border-0 shadow-card p-6 space-y-4 animate-fade-in" style={{ animationDelay: '150ms' }}>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Identificação do documento
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Field label="Tipo" value={TIPO_DFE_LABEL[document.tipo] ?? document.tipo} />
              <Field label="Número / Série" value={`${document.numero ?? '—'} / ${document.serie ?? '—'}`} />
              <Field label="NSU SEFAZ" value={document.nsu ?? '—'} mono />
              <Field label="Versão Focus" value={document.versaoFocus ?? '—'} mono />
              <Field label="Conferido em" value={fmtDate(document.conferidoEm)} />
              <Field label="Escriturado em" value={fmtDate(document.escrituradoEm)} />
            </dl>
            {document.observacoes && (
              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Observações: </span>
                {document.observacoes}
              </div>
            )}
          </Card>

          <Card className="border-0 shadow-card p-6 space-y-4 animate-fade-in" style={{ animationDelay: '200ms' }}>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Histórico de manifestações
              <span className="text-xs font-normal text-muted-foreground">
                ({manifestations.length})
              </span>
            </h2>

            {manifestations.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Nenhuma manifestação registrada ainda. Clique em{' '}
                <strong>Manifestar</strong> para enviar à SEFAZ.
              </div>
            ) : (
              <ol className="relative border-l-2 border-border space-y-4 ml-2 pl-6">
                {manifestations.map((m) => (
                  <ManifestationItem key={m.id} manifestation={m} />
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-6">
          <Card className="border-0 shadow-card p-6 space-y-3 animate-fade-in" style={{ animationDelay: '250ms' }}>
            <h3 className="font-display text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              XML completo
            </h3>
            {xmlDisponivel ? (
              <>
                <p className="text-xs text-muted-foreground">
                  XML autorizado (procNFe) já recebido — disponível para escrituração.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    void navigator.clipboard.writeText(document.xmlCompleto!);
                    toast.success('XML copiado para a área de transferência.');
                  }}
                >
                  Copiar XML
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ainda não disponível. Confirme a operação (
                <strong>Confirmação da operação</strong>) para a SEFAZ liberar o
                download.
              </p>
            )}
          </Card>

          {document.resumoXml && (
            <Card
              className="border-0 shadow-card p-6 space-y-3 animate-fade-in"
              style={{ animationDelay: '300ms' }}
            >
              <h3 className="font-display text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Resumo (resNFe)
              </h3>
              <p className="text-xs text-muted-foreground">
                Resumo retornado pela SEFAZ na primeira chamada de distribuição.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  void navigator.clipboard.writeText(document.resumoXml!);
                  toast.success('Resumo copiado.');
                }}
              >
                Copiar resumo XML
              </Button>
            </Card>
          )}
        </div>
      </div>

      <ManifestDialog
        open={manifestOpen}
        onClose={() => {
          setManifestOpen(false);
          void query.refetch();
        }}
        document={document}
      />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Voltar para a Inbox
    </button>
  );
}

function StatusBadge({ status }: { status: ReceivedDocumentStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.bg} ${tone.text}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function InfoCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'primary' | 'info' | 'default';
}) {
  const cls = {
    primary: 'bg-primary/10 text-primary',
    info: 'bg-info-soft text-info',
    default: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <Card className="p-5 border-0 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-display text-xl font-bold text-foreground mt-1 truncate">
            {value}
          </p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`rounded-xl p-2.5 shrink-0 ${cls}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function ManifestationItem({
  manifestation,
}: {
  manifestation: DfeManifestationView;
}): React.ReactElement {
  const aceito = manifestation.cStat === '135' || manifestation.cStat === '136';
  const pendente = !manifestation.cStat && !manifestation.enviadoEm;
  const StatusIcon = pendente ? Loader2 : aceito ? CheckCircle2 : XCircle;
  const dotColor = pendente
    ? 'bg-muted text-muted-foreground'
    : aceito
      ? 'bg-success-soft text-success'
      : 'bg-destructive-soft text-destructive';

  return (
    <li className="relative">
      <span
        className={`absolute -left-[34px] flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-background ${dotColor}`}
      >
        <StatusIcon className={`h-3.5 w-3.5 ${pendente ? 'animate-spin' : ''}`} />
      </span>
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">
            {TIPO_MANIFESTACAO_LABEL[manifestation.tipo] ?? manifestation.tipo}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(manifestation.dhEvento).toLocaleString('pt-BR')}
          </p>
        </div>
        {manifestation.justificativa && (
          <p className="text-xs italic text-muted-foreground">
            "{manifestation.justificativa}"
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {manifestation.cStat && (
            <span>
              <strong className={aceito ? 'text-success' : 'text-destructive'}>
                cStat {manifestation.cStat}
              </strong>
              {manifestation.xMotivo ? ` — ${manifestation.xMotivo}` : ''}
            </span>
          )}
          {manifestation.protocolo && (
            <span className="font-mono">protocolo {manifestation.protocolo}</span>
          )}
        </div>
      </div>
    </li>
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

function fmtDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('pt-BR');
}

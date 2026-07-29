import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Ban,
  Eye,
  FileDown,
  FileText,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { listCertificates } from '@/features/certificates/certificates-api';
import { getCustomer, listCustomers } from '@/features/customers/customers-api';
import { env } from '@/env';
import { NFeImportExportActions } from '@/features/nfe/NFeImportExportActions';
import {
  cancelNFe,
  deleteNFe,
  downloadNFeXml,
  generateDanfe,
  listNFes,
} from '@/features/nfe/nfe-api';
import { formatMoney } from '@/lib/format';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Select } from '@/shared/components/ui/Select';
import { SearchCombobox, type ComboboxOption } from '@/shared/components/ui/SearchCombobox';
import { Textarea } from '@/shared/components/ui/Textarea';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { usePagination } from '@/shared/hooks/usePagination';
import { STATUS_LABEL, STATUS_STYLES } from '@/shared/types/fiscal';
import type { DocumentStatus, NFeListItem } from '@/shared/types/fiscal';

const STATUSES: DocumentStatus[] = [
  'DRAFT',
  'PENDING',
  'PROCESSING',
  'AUTHORIZED',
  'REJECTED',
  'DENIED',
  'CANCELLED',
  'INUTILIZED',
];

export function NFeListPage(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [competencia, setCompetencia] = useState(''); // 'YYYY-MM'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const pagination = usePagination({ initialPageSize: 50 });
  const queryClient = useQueryClient();

  useEffect(() => {
    pagination.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, customerId, debouncedSearch, competencia, fromDate, toDate]);

  // Competência (mês/ano) tem precedência: quando preenchida, ignoramos o intervalo de datas.
  const period = useMemo(() => {
    if (competencia) {
      const [ano, mes] = competencia.split('-').map(Number);
      return { ano, mes };
    }
    return {
      from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
      to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
    };
  }, [competencia, fromDate, toDate]);

  const { data, isLoading } = useQuery({
    queryKey: [
      'nfe',
      statusFilter,
      customerId,
      debouncedSearch,
      period,
      pagination.page,
      pagination.pageSize,
    ],
    queryFn: () =>
      listNFes({
        status: statusFilter || undefined,
        customerId: customerId || undefined,
        search: debouncedSearch || undefined,
        ...period,
        limit: pagination.pageSize,
        offset: pagination.offset,
      }),
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Relatório de NF-e emitidas"
        description="Notas Fiscais Eletrônicas modelo 55 da empresa selecionada. Filtre, baixe, cancele ou reemita."
        actions={
          <>
            <NFeImportExportActions
              onImported={() => queryClient.invalidateQueries({ queryKey: ['nfe'] })}
            />
            <Link to="/fiscal/nfe/inutilizar">
              <Button variant="outline">Inutilizar faixa</Button>
            </Link>
            <Link to="/fiscal/nfe/new" search={{ reissueFrom: undefined }}>
              <Button>Emitir nova NF-e</Button>
            </Link>
          </>
        }
      />

      {/* === Filtros === */}
      <Card className="border-0 p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Buscar</Label>
            <Input
              placeholder="Chave, número, cliente ou CNPJ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Situação</Label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | '')}
            >
              <option value="">Todas as situações</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente</Label>
            <SearchCombobox
              value={customerId}
              onChange={setCustomerId}
              placeholder="Todos os clientes"
              emptyHint="Nenhum cliente"
              fetchOptions={async (term) => {
                const { items } = await listCustomers({ search: term || undefined, limit: 20 });
                return items.map(
                  (c): ComboboxOption => ({
                    value: c.id,
                    label: c.nomeRazao,
                    render: (
                      <div className="flex flex-col">
                        <span className="font-medium">{c.nomeRazao}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDoc(c.cnpjCpf)}
                        </span>
                      </div>
                    ),
                  }),
                );
              }}
              loadSelected={async (id) => {
                const c = await getCustomer(id);
                return { value: c.id, label: c.nomeRazao };
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Competência</Label>
            <Input
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Emissão de</Label>
            <Input
              type="date"
              value={fromDate}
              disabled={Boolean(competencia)}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Emissão até</Label>
            <Input
              type="date"
              value={toDate}
              disabled={Boolean(competencia)}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
        {competencia ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Filtrando pela competência {competencia.split('-').reverse().join('/')}. Limpe o
            campo para usar o intervalo de datas.
          </p>
        ) : null}
      </Card>

      {/* === Tabela === */}
      <NFeReportTable
        items={items}
        total={data?.total ?? 0}
        isLoading={isLoading}
        pagination={pagination}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['nfe'] })}
      />
    </PageContainer>
  );
}

function NFeReportTable({
  items,
  total,
  isLoading,
  pagination,
  onChanged,
}: {
  items: NFeListItem[];
  total: number;
  isLoading: boolean;
  pagination: ReturnType<typeof usePagination>;
  onChanged: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const [cancelTarget, setCancelTarget] = useState<NFeListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NFeListItem | null>(null);
  const [certRef, setCertRef] = useState('');
  const [cancelJust, setCancelJust] = useState('');
  // Ciência do cancelamento extemporâneo (após 24h da autorização).
  const [cancelForaPrazoOk, setCancelForaPrazoOk] = useState(false);
  const cancelForaDoPrazo = cancelTarget ? rowActions(cancelTarget).foraDoPrazo : false;

  const { data: certificates } = useQuery({
    queryKey: ['certificates'],
    queryFn: listCertificates,
  });

  const xmlMutation = useMutation({
    mutationFn: (id: string) => downloadNFeXml(id),
    onError: () => toast.error('Falha ao baixar XML.'),
  });

  const danfeMutation = useMutation({
    mutationFn: (id: string) => generateDanfe(id),
    onSuccess: (result) => window.open(`${env.apiBaseUrl}${result.signedUrl}`, '_blank'),
    onError: () => toast.error('Falha ao gerar DANFE.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelNFe(cancelTarget!.id, {
        justificativa: cancelJust,
        certificateVaultRef: certRef,
        forcarForaPrazo: cancelForaPrazoOk,
      }),
    onSuccess: (result) => {
      // HTTP 200 não significa cancelamento aceito: a SEFAZ pode rejeitar o evento
      // (cStat ≠ 135/155) e a nota seguir autorizada — comum no envio extemporâneo.
      if (result.cStat !== '135' && result.cStat !== '155') {
        toast.error(
          `Cancelamento rejeitado pela SEFAZ${result.cStat ? ` (cStat ${result.cStat})` : ''}: ` +
            (result.xMotivo ?? 'motivo não informado'),
        );
        onChanged();
        return;
      }
      toast.success(
        result.cStat === '155'
          ? 'NF-e cancelada fora do prazo (cStat 155) — pode gerar multa.'
          : 'NF-e cancelada.',
      );
      resetCancel();
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Falha ao cancelar.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNFe(deleteTarget!.id),
    onSuccess: () => {
      toast.success('NF-e excluída.');
      setDeleteTarget(null);
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Falha ao excluir.'),
  });

  function resetCancel(): void {
    setCancelTarget(null);
    setCancelJust('');
    setCertRef('');
    setCancelForaPrazoOk(false);
  }

  return (
    <Card className="border-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {isLoading ? 'Carregando…' : `${total} NF-e`}
        </h2>
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma NF-e encontrada com os filtros atuais.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <Th>Código</Th>
                <Th>Emissão</Th>
                <Th>Razão social</Th>
                <Th>CNPJ/CPF</Th>
                <Th className="text-right">Valor</Th>
                <Th>Situação</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((nfe) => {
                const flags = rowActions(nfe);
                return (
                  <tr key={nfe.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium">{String(nfe.numero).padStart(9, '0')}</div>
                      <div className="text-xs text-muted-foreground">Série {nfe.serie}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-foreground">
                      {new Date(nfe.dhEmissao).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 max-w-[16rem] truncate" title={nfe.customerNome ?? ''}>
                      {nfe.customerNome ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                      {formatDoc(nfe.customerCnpjCpf)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium">
                      {formatBRL(nfe.valorTotal)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge className={STATUS_STYLES[nfe.status]}>
                        {STATUS_LABEL[nfe.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          title="Abrir detalhes"
                          onClick={() =>
                            navigate({ to: '/fiscal/nfe/$id', params: { id: nfe.id } })
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </IconButton>
                        {flags.isAuthorized ? (
                          <IconButton
                            title="Baixar DANFE (PDF)"
                            loading={danfeMutation.isPending && danfeMutation.variables === nfe.id}
                            onClick={() => danfeMutation.mutate(nfe.id)}
                          >
                            <FileText className="h-4 w-4" />
                          </IconButton>
                        ) : null}
                        {flags.canDownloadXml ? (
                          <IconButton
                            title="Baixar XML"
                            loading={xmlMutation.isPending && xmlMutation.variables === nfe.id}
                            onClick={() => xmlMutation.mutate(nfe.id)}
                          >
                            <FileDown className="h-4 w-4" />
                          </IconButton>
                        ) : null}
                        {flags.canCancel ? (
                          <IconButton
                            title={
                              flags.foraDoPrazo
                                ? 'Cancelar NF-e (fora das 24h — extemporâneo)'
                                : 'Cancelar NF-e'
                            }
                            variant="destructive"
                            onClick={() => setCancelTarget(nfe)}
                          >
                            <Ban className="h-4 w-4" />
                          </IconButton>
                        ) : null}
                        {flags.canReissue ? (
                          <IconButton
                            title="Reemitir (nota não autorizada)"
                            onClick={() =>
                              navigate({ to: '/fiscal/nfe/new', search: { reissueFrom: nfe.id } })
                            }
                          >
                            <RefreshCw className="h-4 w-4" />
                          </IconButton>
                        ) : null}
                        {flags.canDelete ? (
                          <IconButton
                            title="Excluir do sistema (libera a numeração)"
                            variant="destructive"
                            onClick={() => setDeleteTarget(nfe)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 pb-3">
        <Pagination
          total={total}
          page={pagination.page}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          isLoading={isLoading}
          className="pt-2"
        />
      </div>

      {/* === Modal: Cancelar === */}
      <Modal
        open={cancelTarget !== null}
        title={cancelForaDoPrazo ? 'Cancelar NF-e (fora do prazo)' : 'Cancelar NF-e'}
        description={
          cancelForaDoPrazo
            ? 'Passadas as 24h da autorização, o cancelamento é extemporâneo: quem aceita ou recusa é a SEFAZ.'
            : 'Ação irreversível. Prazo padrão de 24h após a autorização.'
        }
        onClose={resetCancel}
        onConfirm={() => cancelMutation.mutate()}
        confirmLabel="Confirmar cancelamento"
        destructive
        loading={cancelMutation.isPending}
        confirmDisabled={cancelForaDoPrazo && !cancelForaPrazoOk}
      >
        <div className="space-y-3">
          {cancelTarget ? (
            <p className="text-sm text-muted-foreground">
              NF-e nº <strong>{String(cancelTarget.numero).padStart(9, '0')}</strong> · Série{' '}
              {cancelTarget.serie} · {cancelTarget.customerNome ?? '—'}
            </p>
          ) : null}
          {cancelForaDoPrazo ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
              <p className="text-muted-foreground">
                Fora da janela de 24h. O evento será transmitido mesmo assim: a SEFAZ pode
                homologar fora do prazo (cStat 155, sujeito a multa) ou rejeitar — e, se
                rejeitar, a nota continua autorizada.
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border"
                  checked={cancelForaPrazoOk}
                  onChange={(e) => setCancelForaPrazoOk(e.target.checked)}
                />
                <span>Estou ciente e quero tentar o cancelamento extemporâneo.</span>
              </label>
            </div>
          ) : null}
          <div>
            <Label>Certificado para assinar</Label>
            <Select value={certRef} onChange={(e) => setCertRef(e.target.value)}>
              <option value="">Selecione…</option>
              {certificates
                ?.filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.alias}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label>Justificativa (mínimo 15 caracteres)</Label>
            <Textarea
              value={cancelJust}
              onChange={(e) => setCancelJust(e.target.value)}
              placeholder="Ex.: Erro de digitação no nome do destinatário."
            />
            <p className="text-xs text-muted-foreground">{cancelJust.length}/15+</p>
          </div>
        </div>
      </Modal>

      {/* === Modal: Excluir === */}
      <Modal
        open={deleteTarget !== null}
        title="Excluir NF-e do sistema"
        description="Disponível apenas para notas que nunca foram autorizadas na SEFAZ. Libera a numeração para reuso."
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate()}
        confirmLabel="Confirmar exclusão"
        destructive
        loading={deleteMutation.isPending}
      >
        {deleteTarget ? (
          <p className="text-sm">
            NF-e nº <strong>{String(deleteTarget.numero).padStart(9, '0')}</strong>, série{' '}
            <strong>{deleteTarget.serie}</strong> — situação{' '}
            <Badge className={STATUS_STYLES[deleteTarget.status]}>
              {STATUS_LABEL[deleteTarget.status]}
            </Badge>
          </p>
        ) : null}
      </Modal>
    </Card>
  );
}

interface RowFlags {
  isAuthorized: boolean;
  canCancel: boolean;
  /** Passou das 24h da autorização — cancelamento vira extemporâneo. */
  foraDoPrazo: boolean;
  canReissue: boolean;
  canDelete: boolean;
  canDownloadXml: boolean;
}

/** Espelha a lógica de disponibilidade de ações do NFeDetailsPage. */
function rowActions(nfe: NFeListItem): RowFlags {
  const isAuthorized = nfe.status === 'AUTHORIZED';
  const hoursSinceAuth = nfe.dhAutorizacao
    ? (Date.now() - new Date(nfe.dhAutorizacao).getTime()) / 3_600_000
    : Infinity;
  return {
    isAuthorized,
    // Fora das 24h o cancelamento continua disponível como extemporâneo — quem decide
    // é a SEFAZ. O modal exige ciência explícita antes de transmitir.
    canCancel: isAuthorized,
    foraDoPrazo: isAuthorized && hoursSinceAuth > 24,
    canReissue: ['REJECTED', 'PENDING', 'DENIED'].includes(nfe.status),
    canDelete: ['DRAFT', 'PENDING', 'SUBMITTED', 'REJECTED', 'ERROR'].includes(nfe.status),
    canDownloadXml: ['AUTHORIZED', 'REJECTED', 'DENIED', 'SUBMITTED', 'PROCESSING'].includes(
      nfe.status,
    ),
  };
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground ${className}`}
    >
      {children}
    </th>
  );
}

function IconButton({
  children,
  title,
  onClick,
  loading,
  variant = 'ghost',
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  loading?: boolean;
  variant?: 'ghost' | 'destructive';
}): React.ReactElement {
  return (
    <Button
      variant={variant}
      size="icon"
      className="h-8 w-8"
      title={title}
      aria-label={title}
      loading={loading}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** Formata CNPJ (14 díg.) ou CPF (11 díg.); devolve o valor cru se não bater. */
function formatDoc(doc: string | null): string {
  if (!doc) return '—';
  const d = doc.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc;
}

function formatBRL(value: string): string {
  return formatMoney(value, `R$ ${value}`);
}

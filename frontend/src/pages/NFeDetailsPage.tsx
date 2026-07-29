import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { listCertificates } from '@/features/certificates/certificates-api';
import {
  cancelNFe,
  deleteNFe,
  downloadNFeXml,
  emitirCce,
  generateDanfe,
  getNFe,
  sendNFeByEmail,
} from '@/features/nfe/nfe-api';
import { env } from '@/env';
import { ApiError } from '@/lib/api';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Modal } from '@/shared/components/ui/Modal';
import { Select } from '@/shared/components/ui/Select';
import { Textarea } from '@/shared/components/ui/Textarea';
import { STATUS_LABEL, STATUS_STYLES } from '@/shared/types/fiscal';

export function NFeDetailsPage(): React.ReactElement {
  // O route ID inclui o id do layout pai (`/app-layout/...`) — TanStack Router
  // monta o ID canônico a partir da árvore de routes, não da URL pública.
  const { id } = useParams({ from: '/app-layout/fiscal/nfe/$id' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: nfe, isLoading, error } = useQuery({
    queryKey: ['nfe', id],
    queryFn: () => getNFe(id),
  });
  const { data: certificates } = useQuery({
    queryKey: ['certificates'],
    queryFn: listCertificates,
  });

  const [certRef, setCertRef] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelJust, setCancelJust] = useState('');
  // Ciência do cancelamento extemporâneo (após 24h) — exigida antes de transmitir.
  const [cancelForaPrazoOk, setCancelForaPrazoOk] = useState(false);
  const [cceOpen, setCceOpen] = useState(false);
  const [cceTexto, setCceTexto] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelNFe(id, {
        justificativa: cancelJust,
        certificateVaultRef: certRef,
        forcarForaPrazo: cancelForaPrazoOk,
      }),
    onSuccess: (result) => {
      // A SEFAZ pode rejeitar o cancelamento (HTTP 200, mas cStat ≠ 135/155): a nota
      // continua autorizada. Só tratamos como sucesso quando o evento foi aceito; caso
      // contrário, mantemos o modal aberto e mostramos o motivo da rejeição.
      const aceito = result.cStat === '135' || result.cStat === '155';
      if (!aceito) {
        setActionError(
          `Cancelamento rejeitado pela SEFAZ${result.cStat ? ` (cStat ${result.cStat})` : ''}: ` +
            (result.xMotivo ?? 'motivo não informado'),
        );
        return;
      }
      setActionError(null);
      setCancelOpen(false);
      setCancelJust('');
      setCancelForaPrazoOk(false);
      void queryClient.invalidateQueries({ queryKey: ['nfe', id] });
    },
    onError: (e) => setActionError(formatActionError(e, 'Falha ao cancelar.')),
  });

  const cceMutation = useMutation({
    mutationFn: () => emitirCce(id, { correcao: cceTexto, certificateVaultRef: certRef }),
    onSuccess: () => {
      setCceOpen(false);
      setCceTexto('');
      void queryClient.invalidateQueries({ queryKey: ['nfe', id] });
    },
    onError: (e) => setActionError(formatActionError(e, 'Falha ao emitir CC-e.')),
  });

  const danfeMutation = useMutation({
    mutationFn: () => generateDanfe(id),
    onSuccess: (data) => {
      window.open(`${env.apiBaseUrl}${data.signedUrl}`, '_blank');
    },
    onError: (e) => setActionError(formatActionError(e, 'Falha ao gerar DANFE.')),
  });

  const downloadXmlMutation = useMutation({
    mutationFn: () => downloadNFeXml(id),
    onError: (e) => setActionError(formatActionError(e, 'Falha ao baixar XML.')),
  });

  const emailMutation = useMutation({
    mutationFn: () => sendNFeByEmail(id, { to: emailTo || undefined }),
    onSuccess: () => {
      setEmailOpen(false);
      setEmailTo('');
    },
    onError: (e) => setActionError(formatActionError(e, 'Falha ao enviar e-mail.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNFe(id),
    onSuccess: () => {
      setDeleteOpen(false);
      // Invalida lista pra refletir a remoção e volta pra ela.
      void queryClient.invalidateQueries({ queryKey: ['nfe'] });
      void navigate({ to: '/fiscal/nfe' });
    },
    onError: (e) => setActionError(formatActionError(e, 'Falha ao excluir NF-e.')),
  });

  if (isLoading) return <p>Carregando…</p>;
  if (error || !nfe) return <p className="text-destructive">NF-e não encontrada.</p>;

  const isAuthorized = nfe.status === 'AUTHORIZED';
  const hoursSinceAuth = nfe.dhAutorizacao
    ? (Date.now() - new Date(nfe.dhAutorizacao).getTime()) / 3_600_000
    : Infinity;
  // Cancelar fica sempre disponível para nota autorizada: passadas as 24h o pedido vira
  // extemporâneo e quem homologa (cStat 155) ou rejeita é a SEFAZ da UF, não o sistema.
  const canCancel = isAuthorized;
  const cancelForaDoPrazo = isAuthorized && hoursSinceAuth > 24;
  // Reemissão: válida para NFe rejeitada ou que ficou pendente sem certificado
  // (PENDING). Para PROCESSING o caminho correto é esperar a reconciliação.
  const canReissue = nfe.status === 'REJECTED' || nfe.status === 'PENDING' || nfe.status === 'DENIED';
  // Exclusão local: só status que nunca produziram efeito fiscal na SEFAZ.
  // Espelha a lista do DeleteNFeUseCase.DELETABLE_STATUSES.
  const canDelete = ['DRAFT', 'PENDING', 'SUBMITTED', 'REJECTED', 'ERROR'].includes(nfe.status);
  // XML disponível: AUTHORIZED traz o XML fiscal autorizado. REJECTED/DENIED/SUBMITTED
  // costumam ter só o XML assinado — ainda assim útil pra auditoria/reenvio manual.
  const canDownloadXml = ['AUTHORIZED', 'REJECTED', 'DENIED', 'SUBMITTED', 'PROCESSING'].includes(
    nfe.status,
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              NF-e nº {String(nfe.numero).padStart(9, '0')} · Série {nfe.serie}
            </h1>
            <Badge className={STATUS_STYLES[nfe.status]}>{STATUS_LABEL[nfe.status]}</Badge>
          </div>
          <p className="text-muted-foreground">
            {nfe.naturezaOperacao} · {new Date(nfe.dhEmissao).toLocaleString('pt-BR')}
          </p>
          {nfe.chaveAcesso ? (
            <p className="text-xs font-mono text-muted-foreground mt-1">
              {nfe.chaveAcesso}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {isAuthorized ? (
            <>
              <Button
                variant="secondary"
                onClick={() => danfeMutation.mutate()}
                loading={danfeMutation.isPending}
              >
                Baixar DANFE
              </Button>
              <Button variant="secondary" onClick={() => setEmailOpen(true)}>
                Enviar por e-mail
              </Button>
              <Button variant="secondary" onClick={() => setCceOpen(true)}>
                Carta de Correção
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setActionError(null);
                  setCancelOpen(true);
                }}
                disabled={!canCancel}
                title={
                  cancelForaDoPrazo
                    ? 'Fora das 24h — cancelamento extemporâneo, sujeito à aceitação da SEFAZ'
                    : undefined
                }
              >
                Cancelar
              </Button>
            </>
          ) : null}
          {canDownloadXml ? (
            <Button
              variant="secondary"
              onClick={() => downloadXmlMutation.mutate()}
              loading={downloadXmlMutation.isPending}
              title={
                isAuthorized
                  ? 'Baixa o XML fiscal autorizado.'
                  : 'Baixa o XML da NF-e (sem protocolo — status não-autorizado).'
              }
            >
              Baixar XML
            </Button>
          ) : null}
          {canReissue ? (
            <Button
              variant="primary"
              onClick={() =>
                navigate({
                  to: '/fiscal/nfe/new',
                  search: { reissueFrom: id },
                })
              }
              title="Cria nova NF-e mantendo a mesma numeração desta (que será descartada do sistema)."
            >
              Reemitir
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              title="Remove esta NF-e do sistema. Disponível apenas para notas que nunca foram autorizadas pela SEFAZ — libera a numeração para reuso."
            >
              Excluir
            </Button>
          ) : null}
        </div>
      </header>

      {actionError ? (
        <Card className="border-destructive">
          <CardContent className="pt-6 space-y-1">
            <div className="text-sm font-medium text-destructive">Falha na ação</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-destructive">
              {actionError}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {nfe.xMotivo ? (
        <Card>
          <CardContent className="pt-6 text-sm">
            <span className="font-medium">SEFAZ: </span>
            {nfe.cStat ? `cStat ${nfe.cStat} — ` : ''}
            {nfe.xMotivo}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Totais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Produtos" value={nfe.valorProdutos} />
            <Row label="ICMS" value={nfe.valorIcms} />
            <Row label="IPI" value={nfe.valorIpi} />
            <Row label="PIS" value={nfe.valorPis} />
            <Row label="COFINS" value={nfe.valorCofins} />
            <Row label="IBS" value={nfe.valorIbs} />
            <Row label="CBS" value={nfe.valorCbs} />
            <Row label="IS" value={nfe.valorIs} />
            <Row label="Total" value={nfe.valorTotal} emphasized />
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Itens ({nfe.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {nfe.items.map((it) => (
              <div key={it.id} className="border-b border-border pb-2 last:border-0">
                <div className="font-medium">
                  {it.numeroItem}. {it.codigo} — {it.descricao}
                </div>
                <div className="text-xs text-muted-foreground">
                  NCM {it.ncm} · CFOP {it.cfop} · Qtd {it.quantidadeComercial} ·{' '}
                  R$ {it.valorUnitario} = R$ {it.valorTotal}
                  {it.aliqIcms ? ` · ICMS ${it.aliqIcms}% (R$ ${it.valorIcms})` : ''}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {nfe.eventos.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Eventos ({nfe.eventos.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nfe.eventos.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between border-b border-border pb-2 last:border-0 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {evt.tipoEvento} · Seq {evt.sequencial}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(evt.dhEvento).toLocaleString('pt-BR')}
                    {evt.protocolo ? ` · Protocolo ${evt.protocolo}` : ''}
                  </div>
                  {evt.justificativa ? (
                    <div className="text-xs italic">"{evt.justificativa}"</div>
                  ) : null}
                </div>
                <Badge className={STATUS_STYLES[evt.status]}>
                  {STATUS_LABEL[evt.status]}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* === Modal: Cancelar === */}
      <Modal
        open={cancelOpen}
        title={cancelForaDoPrazo ? 'Cancelar NF-e (fora do prazo)' : 'Cancelar NF-e'}
        description={
          cancelForaDoPrazo
            ? 'Passadas as 24h da autorização, o cancelamento é extemporâneo: quem aceita ou recusa é a SEFAZ.'
            : 'Ação irreversível. Prazo padrão de 24h após a autorização.'
        }
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        confirmLabel="Confirmar cancelamento"
        destructive
        loading={cancelMutation.isPending}
        confirmDisabled={cancelForaDoPrazo && !cancelForaPrazoOk}
      >
        <div className="space-y-3">
          {cancelForaDoPrazo ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
              <p>
                Autorizada há <strong>{formatHorasDesdeAutorizacao(hoursSinceAuth)}</strong> — fora
                da janela padrão de 24h.
              </p>
              <p className="text-muted-foreground">
                O evento será transmitido mesmo assim. A SEFAZ pode homologar fora do prazo
                (cStat 155, sujeito a multa por obrigação acessória) ou rejeitar (ex.: cStat 501,
                prazo superior ao previsto na legislação da UF). Se rejeitar, a nota continua
                autorizada e o caminho é emitir uma nota de devolução.
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
              {certificates?.filter((c) => c.active).map((c) => (
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
          {actionError && cancelOpen ? (
            <p className="text-sm text-destructive whitespace-pre-wrap">{actionError}</p>
          ) : null}
        </div>
      </Modal>

      {/* === Modal: CC-e === */}
      <Modal
        open={cceOpen}
        title="Carta de Correção Eletrônica"
        description="Até 20 CC-e por NF-e, vale a última. Não altera valores, CNPJ, base de cálculo ou data."
        onClose={() => setCceOpen(false)}
        onConfirm={() => cceMutation.mutate()}
        confirmLabel="Enviar correção"
        loading={cceMutation.isPending}
      >
        <div className="space-y-3">
          <div>
            <Label>Certificado para assinar</Label>
            <Select value={certRef} onChange={(e) => setCertRef(e.target.value)}>
              <option value="">Selecione…</option>
              {certificates?.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Texto da correção (15-1000 caracteres)</Label>
            <Textarea
              value={cceTexto}
              onChange={(e) => setCceTexto(e.target.value)}
              placeholder="Descreva exatamente o que está sendo corrigido."
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground">{cceTexto.length}/1000</p>
          </div>
        </div>
      </Modal>

      {/* === Modal: Excluir === */}
      <Modal
        open={deleteOpen}
        title="Excluir NF-e do sistema"
        description="Esta nota nunca foi autorizada na SEFAZ. Ao excluir, a numeração fica liberada para reuso."
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        confirmLabel="Confirmar exclusão"
        destructive
        loading={deleteMutation.isPending}
      >
        <div className="space-y-2 text-sm">
          <p>
            NF-e nº <strong>{String(nfe.numero).padStart(9, '0')}</strong>, série{' '}
            <strong>{nfe.serie}</strong> — status{' '}
            <Badge className={STATUS_STYLES[nfe.status]}>{STATUS_LABEL[nfe.status]}</Badge>
          </p>
          <p className="text-muted-foreground">
            A nota será removida do banco local. Notas autorizadas, canceladas ou
            denegadas não podem ser excluídas — use Cancelar (24h) ou Inutilizar
            Faixa para esses casos.
          </p>
        </div>
      </Modal>

      {/* === Modal: Email === */}
      <Modal
        open={emailOpen}
        title="Enviar por e-mail"
        description="Anexa XML + DANFE PDF."
        onClose={() => setEmailOpen(false)}
        onConfirm={() => emailMutation.mutate()}
        confirmLabel="Enviar"
        loading={emailMutation.isPending}
      >
        <div className="space-y-2">
          <Label>Destinatário (vazio = e-mail cadastrado no cliente)</Label>
          <Input
            placeholder="opcional@example.com"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

/** Espelha o helper do NFeNewPage: materializa code+details+requestId num bloco unico. */
/** "3 dias e 5h" / "31h" — só para o aviso de cancelamento fora do prazo. */
function formatHorasDesdeAutorizacao(horas: number): string {
  if (!Number.isFinite(horas)) return 'tempo desconhecido';
  if (horas < 48) return `${Math.floor(horas)}h`;
  const dias = Math.floor(horas / 24);
  const resto = Math.floor(horas % 24);
  return resto > 0 ? `${dias} dias e ${resto}h` : `${dias} dias`;
}

function formatActionError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : fallback;
  }
  const lines: string[] = [`[${err.code}] ${err.message}`];
  if (err.details && typeof err.details === 'object') {
    const d = err.details as Record<string, unknown>;
    const fieldErrors = d.fieldErrors as Record<string, string[]> | undefined;
    if (fieldErrors) {
      for (const [field, msgs] of Object.entries(fieldErrors)) {
        lines.push(`  · ${field}: ${(msgs ?? []).join(', ')}`);
      }
    }
    if (Array.isArray(d.formErrors) && d.formErrors.length > 0) {
      lines.push(`  · ${(d.formErrors as string[]).join(' · ')}`);
    }
    for (const [k, v] of Object.entries(d)) {
      if (k === 'fieldErrors' || k === 'formErrors' || k === 'stack') continue;
      if (typeof v === 'string' || typeof v === 'number') lines.push(`  · ${k}: ${v}`);
    }
  }
  if (err.requestId) lines.push(`  (requestId: ${err.requestId})`);
  return lines.join('\n');
}

function Row({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasized ? 'font-bold' : ''}>R$ {value}</span>
    </div>
  );
}

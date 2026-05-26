import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { listCertificates } from '@/features/certificates/certificates-api';
import { ApiError } from '@/lib/api';
import { Button } from '@/shared/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/Dialog';
import { Label } from '@/shared/components/ui/Label';
import { Select } from '@/shared/components/ui/Select';

import {
  manifestarDocumento,
  type ReceivedDocument,
  type TipoManifestacao,
} from './recepcao-api';

const TIPO_LABEL: Record<TipoManifestacao, string> = {
  CIENCIA_OPERACAO: 'Ciência da operação',
  CONFIRMACAO_OPERACAO: 'Confirmação da operação',
  DESCONHECIMENTO_OPERACAO: 'Desconhecimento da operação',
  OPERACAO_NAO_REALIZADA: 'Operação não realizada',
};

const TIPO_DESCRICAO: Record<TipoManifestacao, string> = {
  CIENCIA_OPERACAO:
    'Apenas registra que estou ciente da existência da NF-e. Não libera o XML completo.',
  CONFIRMACAO_OPERACAO:
    'Confirmo que a operação ocorreu (recebi a mercadoria). LIBERA o XML completo da NF-e para download.',
  DESCONHECIMENTO_OPERACAO:
    'Não reconheço a operação — fornecedor emitiu indevidamente NF-e contra meu CNPJ. Justificativa obrigatória (≥ 15 caracteres).',
  OPERACAO_NAO_REALIZADA:
    'A operação documentada não ocorreu (devolução total na entrada, falta de mercadoria). Justificativa obrigatória (≥ 15 caracteres).',
};

const EXIGE_JUSTIFICATIVA: TipoManifestacao[] = [
  'DESCONHECIMENTO_OPERACAO',
  'OPERACAO_NAO_REALIZADA',
];

interface ManifestDialogProps {
  open: boolean;
  onClose: () => void;
  document: ReceivedDocument | null;
}

export function ManifestDialog({
  open,
  onClose,
  document,
}: ManifestDialogProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TipoManifestacao>('CIENCIA_OPERACAO');
  const [justificativa, setJustificativa] = useState('');
  const [certificateVaultRef, setCertificateVaultRef] = useState('');

  useEffect(() => {
    if (open) {
      setTipo('CIENCIA_OPERACAO');
      setJustificativa('');
      setCertificateVaultRef('');
    }
  }, [open]);

  const certificatesQuery = useQuery({
    queryKey: ['certificates'],
    queryFn: listCertificates,
    enabled: open,
  });

  const certificadosAtivos =
    certificatesQuery.data?.filter((c) => c.active) ?? [];

  const exigeJust = EXIGE_JUSTIFICATIVA.includes(tipo);
  const justificativaValida = !exigeJust || justificativa.trim().length >= 15;

  const mutation = useMutation({
    mutationFn: () => {
      if (!document) throw new Error('Documento não selecionado');
      return manifestarDocumento(document.id, {
        tipo,
        justificativa: exigeJust ? justificativa : undefined,
        certificateVaultRef,
      });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['received-documents'] });
      const accepted = result.cStat === '135' || result.cStat === '136';
      if (accepted) {
        toast.success(
          `${TIPO_LABEL[tipo]} registrada na SEFAZ${
            result.triggeredDownload ? ' — XML completo será baixado pelo worker' : ''
          }.`,
        );
      } else {
        toast.error(
          `SEFAZ rejeitou: ${result.cStat ? `cStat ${result.cStat}` : ''}. ${result.xMotivo ?? ''}`,
        );
      }
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao manifestar.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!certificateVaultRef) {
      toast.error('Selecione o certificado A1 para assinar o evento.');
      return;
    }
    if (!justificativaValida) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manifestar destinatário</DialogTitle>
          <DialogDescription>
            {document
              ? `NF-e ${document.numero ?? '—'}/${document.serie ?? '—'} de ${document.emitenteNome}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">
              Tipo de manifestação <span className="text-destructive">*</span>
            </Label>
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoManifestacao)}
            >
              {(Object.keys(TIPO_LABEL) as TipoManifestacao[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{TIPO_DESCRICAO[tipo]}</p>
          </div>

          {exigeJust && (
            <div className="space-y-2">
              <Label className="text-xs">
                Justificativa <span className="text-destructive">*</span>
                <span className="ml-1 text-muted-foreground">
                  (mín. 15 caracteres — {justificativa.trim().length} digitados)
                </span>
              </Label>
              <textarea
                rows={3}
                maxLength={255}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring"
                placeholder="Descreva o motivo. Ex.: 'Mercadoria não chegou no destinatário'."
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">
              Certificado A1 <span className="text-destructive">*</span>
            </Label>
            <Select
              value={certificateVaultRef}
              onChange={(e) => setCertificateVaultRef(e.target.value)}
            >
              <option value="">Selecione o certificado…</option>
              {certificadosAtivos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias} (vence {new Date(c.validTo).toLocaleDateString('pt-BR')})
                </option>
              ))}
            </Select>
            {certificadosAtivos.length === 0 && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft p-2 text-xs text-warning-foreground">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Nenhum certificado A1 ativo. Cadastre um em{' '}
                  <strong>Administração → Certificados A1</strong> antes de manifestar.
                </span>
              </div>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={
              mutation.isPending ||
              !certificateVaultRef ||
              !justificativaValida ||
              certificadosAtivos.length === 0
            }
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Transmitindo à SEFAZ…
              </>
            ) : (
              `Manifestar — ${TIPO_LABEL[tipo]}`
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { listCertificates } from '@/features/certificates/certificates-api';
import {
  inutilizarFaixa,
  type InutilizarFaixaResult,
} from '@/features/nfe/nfe-api';
import { ApiError } from '@/lib/api';
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
import { Select } from '@/shared/components/ui/Select';
import { Textarea } from '@/shared/components/ui/Textarea';

/**
 * Inutilização de faixa de numeração de NF-e. Use quando "queimou" números sem emitir —
 * por exemplo, erro de sistema antes da transmissão ou número reservado que ficou órfão.
 * Sem inutilização, a SEFAZ reporta lacunas na escrituração mensal.
 *
 * IMPORTANTE:
 *  - Só funciona em números que NUNCA foram usados (sem NF-e correspondente em qualquer status)
 *  - Faixa inutilizada não pode ser reusada — é definitivo
 *  - Apenas o emitente pode inutilizar a própria numeração; SEFAZ valida via certificado
 */
export function InutilizacaoPage(): React.ReactElement {
  const certificatesQuery = useQuery({
    queryKey: ['certificates'],
    queryFn: listCertificates,
  });

  const [serie, setSerie] = useState(1);
  const [numeroInicial, setNumeroInicial] = useState('');
  const [numeroFinal, setNumeroFinal] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [certificateVaultRef, setCertificateVaultRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<InutilizarFaixaResult | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      inutilizarFaixa({
        serie,
        numeroInicial: Number(numeroInicial),
        numeroFinal: Number(numeroFinal),
        justificativa,
        ano,
        certificateVaultRef,
      }),
    onSuccess: (result) => {
      setSuccess(result);
      setError(null);
      // limpa só o range — série/cert/ano permanecem pra reuso rápido
      setNumeroInicial('');
      setNumeroFinal('');
      setJustificativa('');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Falha ao inutilizar faixa.');
      setSuccess(null);
    },
  });

  const canSubmit =
    serie > 0 &&
    Number(numeroInicial) > 0 &&
    Number(numeroFinal) >= Number(numeroInicial) &&
    justificativa.trim().length >= 15 &&
    certificateVaultRef.length > 0;

  const activeCerts =
    certificatesQuery.data?.filter((c) => c.active && new Date(c.validTo) > new Date()) ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <Link
          to="/fiscal/nfe"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para NF-e
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Inutilizar faixa de NF-e</h1>
        <p className="text-muted-foreground">
          Envia evento à SEFAZ inutilizando uma faixa de números não usados. Definitivo —
          a faixa não pode ser reusada depois.
        </p>
      </header>

      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="pt-4 flex gap-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-amber-900 space-y-1">
            <p>
              <strong>Quando usar:</strong> erro de sistema antes da transmissão, número reservado
              órfão, configuração equivocada que ocupou faixas sem emitir.
            </p>
            <p>
              <strong>Quando NÃO usar:</strong> NF-e já emitida que precisa ser anulada — nesse
              caso use <em>Cancelamento</em> (dentro de 24h) ou nota de devolução.
            </p>
            <p>Justificativa precisa ter no mínimo 15 caracteres. Toda inutilização fica em auditoria.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faixa a inutilizar</CardTitle>
          <CardDescription>
            Use a mesma série/modelo da numeração que foi reservada. O backend rejeita se houver
            qualquer NF-e dentro do intervalo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Série</Label>
              <Input
                type="number"
                value={serie}
                onChange={(e) => setSerie(Number(e.target.value))}
                min={1}
              />
            </div>
            <div className="space-y-1">
              <Label>Ano</Label>
              <Input
                type="number"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                min={2020}
                max={2099}
              />
            </div>
            <div className="space-y-1">
              <Label>Número inicial</Label>
              <Input
                type="number"
                value={numeroInicial}
                onChange={(e) => setNumeroInicial(e.target.value)}
                min={1}
                placeholder="ex: 1"
              />
            </div>
            <div className="space-y-1">
              <Label>Número final</Label>
              <Input
                type="number"
                value={numeroFinal}
                onChange={(e) => setNumeroFinal(e.target.value)}
                min={1}
                placeholder="ex: 5"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Justificativa (mínimo 15 caracteres)</Label>
            <Textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              placeholder="Ex.: Faixa reservada para emissão automática que falhou em 26/05/2026 por erro de configuração da SEFAZ-SP. Os números não chegaram a ser transmitidos."
            />
            <p className="text-xs text-muted-foreground">
              {justificativa.length} caracteres
            </p>
          </div>

          <div className="space-y-1">
            <Label>Certificado A1 para assinar o evento</Label>
            <Select
              value={certificateVaultRef}
              onChange={(e) => setCertificateVaultRef(e.target.value)}
            >
              <option value="">— Selecione —</option>
              {activeCerts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias} (vence {new Date(c.validTo).toLocaleDateString('pt-BR')})
                </option>
              ))}
            </Select>
            {activeCerts.length === 0 ? (
              <p className="text-xs text-destructive">
                Nenhum certificado ativo. Cadastre um em /admin/certificates antes de continuar.
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p>
                  Faixa {success.faixa.inicial}–{success.faixa.final} inutilizada (cStat{' '}
                  {success.cStat ?? '—'}).
                </p>
                {success.protocolo ? (
                  <p className="font-mono text-xs">Protocolo: {success.protocolo}</p>
                ) : null}
                {success.xMotivo ? <p className="text-xs">{success.xMotivo}</p> : null}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => mutation.mutate()}
              disabled={!canSubmit || mutation.isPending}
              loading={mutation.isPending}
            >
              Inutilizar faixa
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';

import { previewDanfe, type PreviewDanfePayload } from '@/features/nfe/nfe-api';
import { Button } from '@/shared/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/Card';

interface DanfePreviewPanelProps {
  /** Payload pronto para o preview, ou null quando faltam dados mínimos (cliente + item). */
  payload: PreviewDanfePayload | null;
}

/**
 * Painel do espelho DANFE (PDF), gerado SOB DEMANDA. O PDF é renderizado no backend só
 * quando o usuário clica em "Gerar/Atualizar" — evita custo de render a cada tecla. Quando
 * o formulário muda depois de gerar, mostramos um aviso de que a prévia está desatualizada.
 */
export function DanfePreviewPanel({ payload }: DanfePreviewPanelProps): React.ReactElement {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chave do payload que gerou o PDF atualmente exibido — comparada com a atual para
  // sinalizar quando a prévia ficou desatualizada.
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const payloadKey = payload ? JSON.stringify(payload) : '';
  const isStale = pdfUrl !== null && payloadKey !== '' && payloadKey !== generatedKey;

  const generate = useCallback(async (key: string): Promise<void> => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await previewDanfe(JSON.parse(key) as PreviewDanfePayload);
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPdfUrl(url);
      setGeneratedKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar a pré-visualização');
    } finally {
      setLoading(false);
    }
  }, []);

  // Libera o object URL ao desmontar (evita vazamento de memória).
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Pré-visualização (DANFE)</CardTitle>
          <CardDescription>
            Espelho no formato do DANFE, gerado sob demanda. Sem valor fiscal até a emissão.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {pdfUrl ? (
            <>
              {/* Abrir em nova aba é navegação de topo — não passa por frame-src, então
                  funciona mesmo se o CSP bloquear o iframe embutido. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(pdfUrl, '_blank', 'noopener')}
              >
                Abrir em nova aba
              </Button>
              <a href={pdfUrl} download="danfe-previa.pdf">
                <Button type="button" variant="outline" size="sm">
                  Baixar PDF
                </Button>
              </a>
            </>
          ) : null}
          <Button
            type="button"
            variant={isStale ? 'default' : 'outline'}
            size="sm"
            onClick={() => void generate(payloadKey)}
            loading={loading}
            disabled={!payload}
          >
            {pdfUrl ? 'Atualizar' : 'Gerar pré-visualização'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!payload ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Selecione o cliente e ao menos um item para ver o espelho da nota.
          </div>
        ) : (
          <div className="relative">
            {error ? (
              <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                {error}
              </div>
            ) : null}
            {isStale ? (
              <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                A nota mudou desde a última prévia. Clique em <strong>Atualizar</strong> para
                regenerar.
              </div>
            ) : null}
            {pdfUrl ? (
              <>
                <iframe
                  title="Pré-visualização do DANFE"
                  src={pdfUrl}
                  className="h-[820px] w-full rounded-md border bg-white"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Não apareceu aqui? Use <strong>Abrir em nova aba</strong> ou{' '}
                  <strong>Baixar PDF</strong> acima.
                </p>
              </>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {loading
                  ? 'Gerando pré-visualização…'
                  : 'Clique em “Gerar pré-visualização” para ver o espelho da nota.'}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

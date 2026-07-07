import { useRef, useState } from 'react';

import {
  exportXmlCompetencia,
  importNFeXml,
  type ImportXmlResult,
} from '@/features/nfe/nfe-api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Label } from '@/shared/components/ui/Label';
import { Modal } from '@/shared/components/ui/Modal';

interface NFeImportExportActionsProps {
  /** Chamado após importar com sucesso ao menos 1 nota — para a lista recarregar. */
  onImported: () => void;
}

/** Lê um File como base64 puro (sem o prefixo data:...;base64,). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const now = new Date();
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

export function NFeImportExportActions({
  onImported,
}: NFeImportExportActionsProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportXmlResult | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [month, setMonth] = useState(defaultMonth);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setImporting(true);
    setFeedback(null);
    try {
      const arquivos = await Promise.all(
        Array.from(files).map(async (f) => ({ nome: f.name, xmlBase64: await fileToBase64(f) })),
      );
      const result = await importNFeXml(arquivos);
      setImportResult(result);
      if (result.importados.length > 0 || result.atualizados.length > 0) onImported();
    } catch (e) {
      setImportResult({
        importados: [],
        atualizados: [],
        duplicados: [],
        falhas: [{ nome: '—', erro: e instanceof Error ? e.message : 'Falha ao importar' }],
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; // permite reenviar o mesmo arquivo
    }
  }

  async function handleExport(): Promise<void> {
    const [ano, mes] = month.split('-').map(Number);
    if (!ano || !mes) {
      setExportError('Selecione a competência (mês/ano).');
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const total = await exportXmlCompetencia(ano, mes);
      setExportOpen(false);
      setFeedback(`${total} XML(s) exportado(s) para ${String(mes).padStart(2, '0')}/${ano}.`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Falha ao exportar XMLs.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <Button
        variant="outline"
        loading={importing}
        onClick={() => fileInputRef.current?.click()}
      >
        Importar XML
      </Button>
      <Button variant="outline" onClick={() => setExportOpen(true)}>
        Exportar XMLs
      </Button>

      {feedback ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900 shadow-md">
          {feedback}
          <button
            className="ml-3 text-green-700 hover:text-green-900"
            onClick={() => setFeedback(null)}
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Modal de exportação por competência */}
      <Modal
        open={exportOpen}
        title="Exportar XMLs por competência"
        description="Baixa um ZIP com os XMLs de todas as NF-e emitidas no mês selecionado."
        onClose={() => {
          setExportOpen(false);
          setExportError(null);
        }}
        onConfirm={handleExport}
        confirmLabel="Exportar ZIP"
        loading={exporting}
      >
        <div className="space-y-2">
          <Label htmlFor="competencia">Competência</Label>
          <Input
            id="competencia"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            max={defaultMonth}
          />
          {exportError ? (
            <p className="text-sm text-destructive">{exportError}</p>
          ) : null}
        </div>
      </Modal>

      {/* Modal com o resultado da importação */}
      <Modal
        open={importResult !== null}
        title="Resultado da importação"
        onClose={() => setImportResult(null)}
      >
        {importResult ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-4">
              <span className="text-green-700">
                Importadas: <strong>{importResult.importados.length}</strong>
              </span>
              <span className="text-blue-700">
                XML completado: <strong>{importResult.atualizados.length}</strong>
              </span>
              <span className="text-amber-700">
                Duplicadas: <strong>{importResult.duplicados.length}</strong>
              </span>
              <span className="text-destructive">
                Falhas: <strong>{importResult.falhas.length}</strong>
              </span>
            </div>

            {importResult.duplicados.length > 0 ? (
              <div>
                <div className="font-medium text-amber-800">Já existentes (ignoradas):</div>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {importResult.duplicados.map((d) => (
                    <li key={d.chaveAcesso}>
                      Nº {d.numero}/série {d.serie} — {d.nome}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importResult.falhas.length > 0 ? (
              <div>
                <div className="font-medium text-destructive">Falhas:</div>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {importResult.falhas.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium">{f.nome}:</span> {f.erro}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setImportResult(null)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

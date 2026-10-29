import { useEffect, useMemo, useState } from 'react';

import { formatDecimal } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/Dialog';
import { Input } from '@/shared/components/ui/Input';
import type { TaxSimulationItem, TaxSimulationResult } from '@/shared/types/fiscal';

import {
  contarAjustes,
  erroCampo,
  limparAjustes,
  paraInput,
  TRIBUTOS,
  type AjustesDigitados,
  type CampoAjuste,
  type CampoDef,
  type TributoDef,
} from './tax-review';

/** Linha da nota como a tela de emissão a conhece (o modal não sabe de produto/estoque). */
export interface LinhaConferencia {
  rowId: string;
  numero: number;
  descricao: string;
  cfop: string;
  ajustes: AjustesDigitados;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linhas: LinhaConferencia[];
  resultado: TaxSimulationResult | undefined;
  calculando: boolean;
  erro: string | null;
  isSimples: boolean;
  /** Aplica os ajustes nas linhas da nota — dispara o recálculo no backend. */
  onAplicar: (ajustesPorLinha: Record<string, AjustesDigitados>) => void;
}

const NOME_CALCULADORA: Record<string, string> = {
  'icms-proprio': 'ICMS',
  'icms-st': 'ICMS-ST',
  ipi: 'IPI',
  'pis-cofins': 'PIS/COFINS',
  difal: 'DIFAL',
  'fcp-destino': 'FCP destino',
  'credito-sn': 'Crédito ICMS do Simples',
  'ibs-cbs': 'IBS/CBS',
};

/**
 * Modal "Impostos": mostra, item a item, base, alíquota e valor de cada tributo calculado
 * pelo motor e deixa o faturista digitar base/alíquota (e MVA/alíquota interestadual) para
 * recalcular. Os valores e totais exibidos são SEMPRE os devolvidos pelo backend — o mesmo
 * cálculo que vai para o XML na emissão.
 *
 * Edição é em rascunho local: só "Recalcular" aplica nas linhas da nota. Campo apagado
 * volta ao cálculo automático.
 */
export function TaxReviewDialog({
  open,
  onOpenChange,
  linhas,
  resultado,
  calculando,
  erro,
  isSimples,
  onAplicar,
}: Props): React.ReactElement {
  const [rascunho, setRascunho] = useState<Record<string, AjustesDigitados>>({});

  // Reinicia o rascunho a partir do que está aplicado na nota sempre que o modal abre.
  useEffect(() => {
    if (!open) return;
    setRascunho(Object.fromEntries(linhas.map((l) => [l.rowId, { ...l.ajustes }])));
    // Só ao abrir: depois disso o rascunho é do usuário até ele recalcular.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resultadoPorLinha = useMemo(
    () => new Map((resultado?.itens ?? []).map((r) => [r.itemId, r])),
    [resultado],
  );

  const aplicado = useMemo(
    () => Object.fromEntries(linhas.map((l) => [l.rowId, limparAjustes(l.ajustes)])),
    [linhas],
  );
  const pendente = linhas.some(
    (l) => JSON.stringify(limparAjustes(rascunho[l.rowId] ?? {})) !== JSON.stringify(aplicado[l.rowId]),
  );
  const temErro = linhas.some((l) =>
    TRIBUTOS.some((t) =>
      camposEditaveis(t).some((c) => erroCampo(rascunho[l.rowId]?.[c.chave], c.tipo) !== null),
    ),
  );
  const totalAjustes = linhas.reduce((acc, l) => acc + contarAjustes(rascunho[l.rowId]), 0);

  function setCampo(rowId: string, chave: CampoAjuste, texto: string): void {
    setRascunho((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [chave]: texto } }));
  }

  function restaurarLinha(rowId: string): void {
    setRascunho((prev) => ({ ...prev, [rowId]: {} }));
  }

  function recalcular(): void {
    if (temErro) return;
    const limpos = Object.fromEntries(
      linhas.map((l) => [l.rowId, limparAjustes(rascunho[l.rowId] ?? {})]),
    );
    // Campos apagados somem do rascunho e o input volta a mostrar o valor do motor.
    setRascunho(limpos);
    onAplicar(limpos);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            Impostos da nota
            {calculando ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">calculando…</span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Confira base, alíquota e valor de cada tributo. Para corrigir, digite a base e/ou a
            alíquota e clique em <strong>Recalcular</strong> — o valor é sempre base × alíquota.
            Apague o campo para voltar ao cálculo automático.
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {erro}
          </div>
        ) : null}

        <div className="space-y-4">
          {linhas.map((linha) => (
            <ItemConferencia
              key={linha.rowId}
              linha={linha}
              resultado={resultadoPorLinha.get(linha.rowId)}
              rascunho={rascunho[linha.rowId] ?? {}}
              isSimples={isSimples}
              onCampo={(chave, texto) => setCampo(linha.rowId, chave, texto)}
              onRestaurar={() => restaurarLinha(linha.rowId)}
              onEnter={recalcular}
            />
          ))}
        </div>

        {resultado ? <TotaisConferencia totais={resultado.totais} /> : null}

        <DialogFooter className="items-center gap-2">
          <p className="mr-auto text-xs text-muted-foreground">
            {pendente
              ? 'Há alterações ainda não recalculadas — fechar descarta.'
              : totalAjustes > 0
                ? `${totalAjustes} campo(s) com ajuste manual aplicado.`
                : 'Todos os impostos no cálculo automático.'}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              setRascunho(Object.fromEntries(linhas.map((l) => [l.rowId, {}])))
            }
            disabled={totalAjustes === 0}
          >
            Restaurar automático
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={recalcular}
            disabled={temErro || !pendente}
            loading={calculando}
            title={temErro ? 'Corrija os campos em vermelho.' : undefined}
          >
            Recalcular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function camposEditaveis(t: TributoDef): CampoDef[] {
  return [
    ...('chave' in t.base ? [t.base] : []),
    t.aliquota,
    ...(t.extra ? [t.extra] : []),
  ];
}

function lerResultado(r: TaxSimulationItem | undefined, campo: keyof TaxSimulationItem): string | undefined {
  const v = r?.[campo];
  return typeof v === 'string' ? v : undefined;
}

function ItemConferencia({
  linha,
  resultado,
  rascunho,
  isSimples,
  onCampo,
  onRestaurar,
  onEnter,
}: {
  linha: LinhaConferencia;
  resultado: TaxSimulationItem | undefined;
  rascunho: AjustesDigitados;
  isSimples: boolean;
  onCampo: (chave: CampoAjuste, texto: string) => void;
  onRestaurar: () => void;
  onEnter: () => void;
}): React.ReactElement {
  const aplicaveis = TRIBUTOS.filter((t) => resultado?.calculadorasAplicadas.includes(t.calculadora));
  // Crédito do Simples só é notícia para empresa do Simples.
  const naoAplicaveis = Object.keys(NOME_CALCULADORA).filter(
    (c) =>
      !resultado?.calculadorasAplicadas.includes(c) && (c !== 'credito-sn' || isSimples),
  );
  const codigoIcms = resultado?.codigos.csosnIcms
    ? `CSOSN ${resultado.codigos.csosnIcms}`
    : resultado?.codigos.cstIcms
      ? `CST ${resultado.codigos.cstIcms}`
      : null;

  return (
    <section className="rounded-md border border-border">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium">
          #{linha.numero} · {linha.descricao}
        </span>
        <span className="text-xs text-muted-foreground">CFOP {linha.cfop}</span>
        {codigoIcms ? <span className="text-xs text-muted-foreground">ICMS {codigoIcms}</span> : null}
        {resultado ? (
          <span className="text-xs text-muted-foreground">
            vProd R$ {formatDecimal(resultado.valorTotal)}
          </span>
        ) : null}
        {contarAjustes(rascunho) > 0 ? (
          <Badge className="bg-amber-100 text-amber-800">ajuste manual</Badge>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={onRestaurar}
          disabled={contarAjustes(rascunho) === 0}
        >
          Restaurar item
        </Button>
      </header>

      {!resultado ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Item fora do cálculo — preencha Qtd, Valor unit. e CFOP na tela da nota.
        </p>
      ) : (
        <div className="overflow-x-auto px-3 py-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Tributo</th>
                <th className="py-1 pr-2 font-medium">Base de cálculo (R$)</th>
                <th className="py-1 pr-2 font-medium">Alíquota (%)</th>
                <th className="py-1 pr-2 font-medium">Outro</th>
                <th className="py-1 text-right font-medium">Valor (R$)</th>
              </tr>
            </thead>
            <tbody>
              {aplicaveis.map((t) => {
                const bloqueio = t.bloqueio?.(resultado) ?? null;
                return (
                  <tr key={t.id} className="border-t border-border/60 align-top">
                    <td className="py-1.5 pr-2 font-medium">{t.rotulo}</td>
                    {bloqueio ? (
                      <td colSpan={3} className="py-1.5 pr-2 text-xs text-muted-foreground">
                        {bloqueio}
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 pr-2">
                          {'chave' in t.base ? (
                            <CampoInput
                              def={t.base}
                              resultado={resultado}
                              texto={rascunho[t.base.chave]}
                              onChange={onCampo}
                              onEnter={onEnter}
                            />
                          ) : (
                            <span className="text-muted-foreground">
                              {formatDecimal(lerResultado(resultado, t.base.somenteLeitura))}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2">
                          <CampoInput
                            def={t.aliquota}
                            resultado={resultado}
                            texto={rascunho[t.aliquota.chave]}
                            onChange={onCampo}
                            onEnter={onEnter}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          {t.extra && (!t.mostrarExtra || t.mostrarExtra(resultado)) ? (
                            <CampoInput
                              def={t.extra}
                              resultado={resultado}
                              texto={rascunho[t.extra.chave]}
                              onChange={onCampo}
                              onEnter={onEnter}
                              mostrarRotulo
                            />
                          ) : null}
                        </td>
                      </>
                    )}
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {formatDecimal(lerResultado(resultado, t.valor), { fallback: '—' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="mt-2 text-xs text-muted-foreground">
            {isSimples && resultado.codigos.csosnIcms
              ? 'Simples Nacional: ICMS próprio recolhido no DAS, sem destaque na nota. '
              : null}
            {naoAplicaveis.length > 0
              ? `Não se aplicam a este item: ${naoAplicaveis.map((c) => NOME_CALCULADORA[c]).join(', ')}.`
              : null}
          </p>

          {resultado.warnings.length > 0 ? (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {resultado.warnings.map((w, i) => (
                <div key={i}>· {w}</div>
              ))}
            </div>
          ) : null}

          {resultado.memoria.length > 0 ? (
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">Memória de cálculo</summary>
              <ul className="mt-1 space-y-0.5 pl-4">
                {resultado.memoria.map((p, i) => (
                  <li key={i} className="list-disc">
                    {p.resumo}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CampoInput({
  def,
  resultado,
  texto,
  onChange,
  onEnter,
  mostrarRotulo,
}: {
  def: CampoDef;
  resultado: TaxSimulationItem;
  texto: string | undefined;
  onChange: (chave: CampoAjuste, texto: string) => void;
  onEnter: () => void;
  mostrarRotulo?: boolean;
}): React.ReactElement {
  // Sem ajuste, o input mostra o valor calculado pelo motor; o que for digitado vira ajuste.
  const ajustado = texto !== undefined;
  const erro = erroCampo(texto, def.tipo);
  return (
    <div className="flex flex-col gap-0.5">
      {mostrarRotulo ? <span className="text-[10px] text-muted-foreground">{def.rotulo}</span> : null}
      <Input
        value={ajustado ? texto : paraInput(lerResultado(resultado, def.atual), def.tipo)}
        onChange={(e) => onChange(def.chave, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter();
        }}
        inputMode="decimal"
        placeholder={ajustado ? 'automático' : '—'}
        aria-label={def.rotulo}
        title={`${def.rotulo} — apague para voltar ao cálculo automático`}
        className={cn(
          'h-8 w-28 text-right tabular-nums',
          ajustado && !erro && 'border-amber-400 bg-amber-50',
          erro && 'border-destructive',
        )}
      />
      {erro ? <span className="text-[10px] text-destructive">{erro}</span> : null}
    </div>
  );
}

function TotaisConferencia({
  totais,
}: {
  totais: TaxSimulationResult['totais'];
}): React.ReactElement {
  const linhas: Array<[string, string, boolean?]> = [
    ['Valor dos produtos', totais.valorProdutos],
    ['Desconto', totais.valorDesconto],
    ['Frete', totais.valorFrete],
    ['Base ICMS', totais.baseIcms],
    ['ICMS', totais.valorIcms],
    ['Base ICMS-ST', totais.baseIcmsST],
    ['ICMS-ST', totais.valorIcmsST],
    ['IPI', totais.valorIpi],
    ['PIS', totais.valorPis],
    ['COFINS', totais.valorCofins],
    ['DIFAL UF destino', totais.valorICMSUFDest],
    ['FCP UF destino', totais.valorFCPUFDest],
    ['Base IBS/CBS', totais.baseIbsCbs],
    ['IBS', totais.valorIbs],
    ['CBS', totais.valorCbs],
    ['Crédito ICMS Simples', totais.valorCredSN],
    ['Tributos aprox. (Lei 12.741)', totais.valorTotTrib],
    ['Total da nota', totais.valorTotal, true],
  ];
  return (
    <section className="rounded-md border border-border p-3">
      <h3 className="mb-2 text-sm font-semibold">Totais da nota</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        {linhas.map(([rotulo, valor, destaque]) => (
          <div key={rotulo} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{rotulo}</dt>
            <dd className={cn('tabular-nums', destaque ? 'font-bold' : 'font-medium')}>
              {formatDecimal(valor)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Total da nota = produtos − desconto + frete + seguro + outras + ICMS-ST + IPI. DIFAL, FCP
        destino, IBS, CBS e o crédito do Simples não somam no total. PIS/COFINS são calculados
        sem o ICMS destacado na base (Tema 69/STF). Tributos aproximados só em venda a
        consumidor final.
      </p>
    </section>
  );
}

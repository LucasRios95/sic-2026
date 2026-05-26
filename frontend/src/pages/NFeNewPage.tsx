import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { listCertificates } from '@/features/certificates/certificates-api';
import { listCustomers } from '@/features/customers/customers-api';
import {
  emitirNFe,
  simulateTax,
  type FinalidadeNFe,
  type ModFrete,
  type TipoOperacao,
} from '@/features/nfe/nfe-api';
import { listProducts } from '@/features/products/products-api';
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
import { Select } from '@/shared/components/ui/Select';
import { Textarea } from '@/shared/components/ui/Textarea';
import { useDebounce } from '@/shared/hooks/useDebounce';

interface ItemRow {
  id: string;
  productId: string;
  cfop: string;
  quantidade: string;
  valorUnitario: string;
}

let nextRowId = 1;
const makeRow = (): ItemRow => ({
  id: `row-${nextRowId++}`,
  productId: '',
  cfop: '5102',
  quantidade: '1',
  valorUnitario: '0.00',
});

const FINALIDADE_LABEL: Record<FinalidadeNFe, string> = {
  NORMAL: 'Normal',
  COMPLEMENTAR: 'Complementar',
  AJUSTE: 'Ajuste',
  DEVOLUCAO: 'Devolução',
  NOTA_CREDITO: 'Nota de crédito (Reforma)',
  NOTA_DEBITO: 'Nota de débito (Reforma)',
};

/** Finalidades que EXIGEM NF-e referenciada (grupo NFref). */
const FINALIDADES_COM_REF: FinalidadeNFe[] = [
  'COMPLEMENTAR',
  'AJUSTE',
  'DEVOLUCAO',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
];

export function NFeNewPage(): React.ReactElement {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState('');
  const [serie, setSerie] = useState(1);
  const [naturezaOperacao, setNaturezaOperacao] = useState('Venda de Mercadoria');
  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacao>('SAIDA');
  const [finalidade, setFinalidade] = useState<FinalidadeNFe>('NORMAL');
  const [chavesReferenciadas, setChavesReferenciadas] = useState<string[]>([]);
  const [infCpl, setInfCpl] = useState('');
  const [items, setItems] = useState<ItemRow[]>([makeRow()]);
  const [pagamentoMeio, setPagamentoMeio] = useState('01');
  const [certificateVaultRef, setCertificateVaultRef] = useState('');
  const [transmitirImediatamente, setTransmitirImediatamente] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transporte
  const [modFrete, setModFrete] = useState<ModFrete>(9);
  const [transpCnpjCpf, setTranspCnpjCpf] = useState('');
  const [transpNome, setTranspNome] = useState('');
  const [transpIE, setTranspIE] = useState('');
  const [transpEndereco, setTranspEndereco] = useState('');
  const [transpMunicipio, setTranspMunicipio] = useState('');
  const [transpUf, setTranspUf] = useState('');
  const [veicPlaca, setVeicPlaca] = useState('');
  const [veicUf, setVeicUf] = useState('');
  const [volQtd, setVolQtd] = useState('');
  const [volEspecie, setVolEspecie] = useState('');
  const [volPesoLiq, setVolPesoLiq] = useState('');
  const [volPesoBruto, setVolPesoBruto] = useState('');

  const exigeReferencia = FINALIDADES_COM_REF.includes(finalidade);
  const transporteHabilitado = modFrete !== 9;

  const customersQuery = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => listCustomers({ limit: 200 }),
  });
  const productsQuery = useQuery({
    queryKey: ['products', 'select'],
    queryFn: () => listProducts({ limit: 200 }),
  });
  const certificatesQuery = useQuery({
    queryKey: ['certificates'],
    queryFn: listCertificates,
  });

  const activeCustomer = useMemo(
    () => customersQuery.data?.items.find((c) => c.id === customerId),
    [customersQuery.data, customerId],
  );

  // Debounce do payload do simulate para evitar tempestade de requests enquanto digita.
  const simulateInput = useMemo(() => {
    if (!activeCustomer) return null;
    const validItems = items.filter((it) => it.productId && Number(it.quantidade) > 0);
    if (validItems.length === 0) return null;
    return {
      destinatario: {
        uf: activeCustomer.uf,
        consumidorFinal: activeCustomer.consumidorFinal,
        indicadorIE: activeCustomer.indicadorIE,
      },
      itens: validItems.map((it) => ({
        itemId: it.id,
        productId: it.productId,
        quantidade: it.quantidade,
        valorUnitario: it.valorUnitario,
        cfop: it.cfop,
      })),
    };
  }, [activeCustomer, items]);
  const debouncedInput = useDebounce(simulateInput, 400);

  const simulationQuery = useQuery({
    queryKey: ['tax-simulate', debouncedInput],
    queryFn: () => simulateTax(debouncedInput!),
    enabled: !!debouncedInput,
  });

  const valorTotal = simulationQuery.data?.totais.valorTotal ?? '0.00';

  const emitirMutation = useMutation({
    mutationFn: () => {
      const chavesValidas = chavesReferenciadas
        .map((c) => c.replace(/\D/g, ''))
        .filter((c) => c.length === 44);
      // Monta transporte só quando há dado real (evita enviar objeto vazio).
      const transportadoraTemDado =
        transpCnpjCpf || transpNome || transpIE || transpEndereco || transpMunicipio || transpUf;
      const veiculoTemDado = veicPlaca && veicUf;
      const volumeTemDado =
        volQtd || volEspecie || volPesoLiq || volPesoBruto;
      const transporte =
        transportadoraTemDado || veiculoTemDado || volumeTemDado
          ? {
              transportadora: transportadoraTemDado
                ? {
                    cnpjCpf: transpCnpjCpf || undefined,
                    nome: transpNome || undefined,
                    ie: transpIE || undefined,
                    endereco: transpEndereco || undefined,
                    municipio: transpMunicipio || undefined,
                    uf: transpUf ? transpUf.toUpperCase() : undefined,
                  }
                : undefined,
              veiculo: veiculoTemDado
                ? { placa: veicPlaca.toUpperCase(), uf: veicUf.toUpperCase() }
                : undefined,
              volumes: volumeTemDado
                ? [
                    {
                      quantidade: volQtd ? Number(volQtd) : undefined,
                      especie: volEspecie || undefined,
                      pesoLiquido: volPesoLiq || undefined,
                      pesoBruto: volPesoBruto || undefined,
                    },
                  ]
                : undefined,
            }
          : undefined;

      return emitirNFe({
        idempotencyKey: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        customerId,
        serie,
        naturezaOperacao,
        tipoOperacao,
        finalidade,
        modalidadeFrete: modFrete,
        transporte,
        nfeReferenciadas:
          chavesValidas.length > 0
            ? chavesValidas.map((chaveAcesso) => ({ chaveAcesso }))
            : undefined,
        infCpl: infCpl || undefined,
        itens: items
          .filter((it) => it.productId)
          .map((it, idx) => ({
            numeroItem: idx + 1,
            productId: it.productId,
            cfop: it.cfop,
            unidadeComercial:
              productsQuery.data?.items.find((p) => p.id === it.productId)?.unidadeComercial ??
              'UN',
            quantidade: it.quantidade,
            valorUnitario: it.valorUnitario,
          })),
        pagamentos: [{ meio: pagamentoMeio, valor: valorTotal }],
        certificateVaultRef: certificateVaultRef || undefined,
        transmitirImediatamente,
      });
    },
    onSuccess: ({ nfe }) => navigate({ to: '/fiscal/nfe/$id', params: { id: nfe.id } }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Falha ao emitir NF-e'),
  });

  function updateItem(id: string, patch: Partial<ItemRow>): void {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  /**
   * Quando o usuário troca o produto numa linha, autopreenche o CFOP usando o padrão
   * cadastrado no produto (cfopPadraoSaida ou cfopPadraoEntrada conforme tipoOperacao).
   * Quando o produto não tem padrão, mantém o CFOP que já estava no row.
   *
   * Ajuste estadual↔interestadual (5↔6 / 1↔2) fica no backend — o use case `EmitirNFe`
   * tem company.uf + customer.uf carregados e faz a substituição correta antes da
   * transmissão. Aqui só sugere; o faturista pode editar.
   */
  function aplicarProduto(rowId: string, productId: string): void {
    const product = productsQuery.data?.items.find((p) => p.id === productId);
    const baseCfop = product
      ? tipoOperacao === 'SAIDA'
        ? product.cfopPadraoSaida
        : product.cfopPadraoEntrada
      : null;
    updateItem(rowId, { productId, ...(baseCfop ? { cfop: baseCfop } : {}) });
  }

  function removeItem(id: string): void {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.id !== id)));
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Nova NF-e</h1>
        <p className="text-muted-foreground">
          Emissão de Nota Fiscal Eletrônica modelo 55 com pré-visualização tributária em
          tempo real.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Dados gerais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {customersQuery.data?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nomeRazao} — {c.cnpjCpf}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Série</Label>
                <Input
                  type="number"
                  value={serie}
                  onChange={(e) => setSerie(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Tipo de operação (tpNF)</Label>
                <Select
                  value={tipoOperacao}
                  onChange={(e) => setTipoOperacao(e.target.value as TipoOperacao)}
                >
                  <option value="SAIDA">Saída (venda, transferência, remessa)</option>
                  <option value="ENTRADA">Entrada (compra, retorno, devolução recebida)</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Finalidade (finNFe)</Label>
                <Select
                  value={finalidade}
                  onChange={(e) => setFinalidade(e.target.value as FinalidadeNFe)}
                >
                  {(Object.keys(FINALIDADE_LABEL) as FinalidadeNFe[]).map((f) => (
                    <option key={f} value={f}>
                      {FINALIDADE_LABEL[f]}
                    </option>
                  ))}
                </Select>
                {exigeReferencia && (
                  <p className="text-xs text-amber-700">
                    Esta finalidade exige NF-e referenciada (chave de 44 dígitos).
                  </p>
                )}
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Natureza da operação</Label>
                <Input
                  value={naturezaOperacao}
                  onChange={(e) => setNaturezaOperacao(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamento / Certificado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Meio de pagamento</Label>
              <Select
                value={pagamentoMeio}
                onChange={(e) => setPagamentoMeio(e.target.value)}
              >
                <option value="01">Dinheiro</option>
                <option value="03">Cartão de crédito</option>
                <option value="04">Cartão de débito</option>
                <option value="15">Boleto</option>
                <option value="17">PIX</option>
                <option value="90">Sem pagamento</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Certificado A1</Label>
              <Select
                value={certificateVaultRef}
                onChange={(e) => setCertificateVaultRef(e.target.value)}
              >
                <option value="">— Persistir sem transmitir —</option>
                {certificatesQuery.data
                  ?.filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.alias} (vence{' '}
                      {new Date(c.validTo).toLocaleDateString('pt-BR')})
                    </option>
                  ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Sem certificado, a NF-e fica em PENDING.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={transmitirImediatamente}
                onChange={(e) => setTransmitirImediatamente(e.target.checked)}
              />
              Transmitir imediatamente
            </label>
          </CardContent>
        </Card>
      </div>

      {(exigeReferencia || chavesReferenciadas.length > 0) && (
        <Card className={exigeReferencia ? 'border-amber-300' : ''}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">NF-e referenciadas</CardTitle>
              <CardDescription>
                {exigeReferencia
                  ? `Obrigatório para finalidade ${FINALIDADE_LABEL[finalidade]}. ` +
                    'Informe a chave de acesso (44 dígitos) da NF-e original.'
                  : 'Lista de NF-e referenciadas no grupo NFref do XML.'}
              </CardDescription>
            </div>
            <Button
              variant="secondary"
              onClick={() => setChavesReferenciadas((p) => [...p, ''])}
            >
              Adicionar chave
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {chavesReferenciadas.length === 0 ? (
              <Button
                variant="outline"
                onClick={() => setChavesReferenciadas([''])}
              >
                Informar chave referenciada
              </Button>
            ) : (
              chavesReferenciadas.map((chave, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Chave NF-e #{idx + 1}</Label>
                    <Input
                      value={chave}
                      onChange={(e) =>
                        setChavesReferenciadas((prev) => {
                          const next = [...prev];
                          next[idx] = e.target.value.replace(/\D/g, '').slice(0, 44);
                          return next;
                        })
                      }
                      placeholder="44 dígitos sem separadores"
                      maxLength={44}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      {chave.replace(/\D/g, '').length}/44 dígitos
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setChavesReferenciadas((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    ✕
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Itens</CardTitle>
            <CardDescription>
              Preview tributário atualiza conforme você adiciona itens (debounce 400ms).
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={() => setItems((p) => [...p, makeRow()])}>
            Adicionar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((row, idx) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_80px_80px_120px_40px] gap-2 items-end border-b border-border pb-2 last:border-0"
            >
              <div className="space-y-1">
                <Label className="text-xs">Produto #{idx + 1}</Label>
                <Select
                  value={row.productId}
                  onChange={(e) => aplicarProduto(row.id, e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {productsQuery.data?.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.descricao}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CFOP</Label>
                <Input
                  value={row.cfop}
                  onChange={(e) => updateItem(row.id, { cfop: e.target.value })}
                  maxLength={4}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Qtd</Label>
                <Input
                  value={row.quantidade}
                  onChange={(e) => updateItem(row.id, { quantidade: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor unit.</Label>
                <Input
                  value={row.valorUnitario}
                  onChange={(e) => updateItem(row.id, { valorUnitario: e.target.value })}
                />
              </div>
              <Button variant="ghost" onClick={() => removeItem(row.id)} disabled={items.length <= 1}>
                ✕
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transporte</CardTitle>
          <CardDescription>
            Modalidade de frete (modFrete) é obrigatória. Transportadora, veículo e
            volumes são opcionais — preencha quando aplicável.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Modalidade do frete</Label>
            <Select
              value={String(modFrete)}
              onChange={(e) => setModFrete(Number(e.target.value) as ModFrete)}
            >
              <option value="9">9 — Sem ocorrência de transporte</option>
              <option value="0">0 — Contratação por conta do remetente (CIF)</option>
              <option value="1">1 — Contratação por conta do destinatário (FOB)</option>
              <option value="2">2 — Contratação por conta de terceiros</option>
              <option value="3">3 — Transporte próprio do remetente</option>
              <option value="4">4 — Transporte próprio do destinatário</option>
            </Select>
          </div>

          {transporteHabilitado && (
            <>
              <div className="border-t border-border pt-3 space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Transportadora (opcional)
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">CNPJ/CPF</Label>
                    <Input
                      value={transpCnpjCpf}
                      onChange={(e) => setTranspCnpjCpf(e.target.value)}
                      placeholder="Apenas dígitos"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Razão social / Nome</Label>
                    <Input value={transpNome} onChange={(e) => setTranspNome(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">IE</Label>
                    <Input value={transpIE} onChange={(e) => setTranspIE(e.target.value)} />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Endereço</Label>
                    <Input
                      value={transpEndereco}
                      onChange={(e) => setTranspEndereco(e.target.value)}
                      placeholder="Rua/avenida, número, bairro"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Município</Label>
                    <Input
                      value={transpMunicipio}
                      onChange={(e) => setTranspMunicipio(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">UF</Label>
                    <Input
                      value={transpUf}
                      onChange={(e) => setTranspUf(e.target.value.toUpperCase())}
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Veículo (opcional)
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Placa</Label>
                    <Input
                      value={veicPlaca}
                      onChange={(e) => setVeicPlaca(e.target.value.toUpperCase())}
                      placeholder="ABC1D23 ou ABC1234"
                      maxLength={8}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">UF</Label>
                    <Input
                      value={veicUf}
                      onChange={(e) => setVeicUf(e.target.value.toUpperCase())}
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Volume (opcional)
                </Label>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Quantidade</Label>
                    <Input
                      type="number"
                      value={volQtd}
                      onChange={(e) => setVolQtd(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Espécie</Label>
                    <Input
                      value={volEspecie}
                      onChange={(e) => setVolEspecie(e.target.value)}
                      placeholder="CX, PCT..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Peso líquido (kg)</Label>
                    <Input
                      value={volPesoLiq}
                      onChange={(e) => setVolPesoLiq(e.target.value)}
                      placeholder="0.000"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Peso bruto (kg)</Label>
                    <Input
                      value={volPesoBruto}
                      onChange={(e) => setVolPesoBruto(e.target.value)}
                      placeholder="0.000"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pré-visualização tributária
            {simulationQuery.isFetching ? (
              <span className="text-xs text-muted-foreground ml-2">calculando…</span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!simulateInput ? (
            <p className="text-muted-foreground text-sm">
              Selecione um cliente e adicione pelo menos um item com valor.
            </p>
          ) : simulationQuery.error ? (
            <p className="text-destructive text-sm">
              {simulationQuery.error instanceof ApiError
                ? simulationQuery.error.message
                : 'Falha ao calcular tributos.'}
            </p>
          ) : simulationQuery.data ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-3 text-sm">
                <Cell label="Valor produtos" value={simulationQuery.data.totais.valorProdutos} />
                <Cell label="ICMS" value={simulationQuery.data.totais.valorIcms} />
                <Cell label="ICMS-ST" value={simulationQuery.data.totais.valorIcmsST} />
                <Cell label="DIFAL UF dest" value={simulationQuery.data.totais.valorICMSUFDest} />
                <Cell label="IBS" value={simulationQuery.data.totais.valorIbs} />
                <Cell label="CBS" value={simulationQuery.data.totais.valorCbs} />
                <Cell
                  label="Total NF"
                  value={simulationQuery.data.totais.valorTotal}
                  emphasized
                />
                {simulationQuery.data.totais.modoAnoTesteIbsCbs ? (
                  <div className="col-span-4">
                    <Badge className="bg-amber-100 text-amber-800">
                      IBS/CBS em modo ano-teste 2026 — sem recolhimento real
                    </Badge>
                  </div>
                ) : null}
              </div>
              {simulationQuery.data.warnings.length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
                  <div className="font-medium text-amber-900">Avisos:</div>
                  {simulationQuery.data.warnings.map((w, i) => (
                    <div key={i} className="text-amber-800">
                      · {w}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="space-y-1">
            <Label>Informações complementares</Label>
            <Textarea
              value={infCpl}
              onChange={(e) => setInfCpl(e.target.value)}
              placeholder="Texto livre que aparece em infAdic/infCpl no XML"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
        <CardContent className="pt-0 flex justify-end">
          <Button
            onClick={() => emitirMutation.mutate()}
            loading={emitirMutation.isPending}
            disabled={
              !customerId ||
              items.every((it) => !it.productId) ||
              (exigeReferencia &&
                !chavesReferenciadas.some((c) => c.replace(/\D/g, '').length === 44))
            }
          >
            Emitir NF-e
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Cell({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}): React.ReactElement {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={emphasized ? 'text-lg font-bold' : 'text-base font-medium'}>
        R$ {value}
      </div>
    </div>
  );
}

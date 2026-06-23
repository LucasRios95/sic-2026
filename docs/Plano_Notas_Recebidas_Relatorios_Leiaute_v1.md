# Plano — Notas recebidas (sync + importação XML), Relatórios e Varredura de leiaute

> Data: 2026-06-18 · Status: planejado (aguardando execução)

## Context

Três frentes pedidas pelo cliente (DCLASS, em produção na Railway):

1. **XMLs de entrada da SEFAZ não chegam.** Há sync manual (`POST /fiscal/recebidos/sync`) e worker, mas: (a) o sync "conclui com 0 documentos" por um **bug de cStat invertido** — `SincronizarRecebidosUseCase.ts:95` trata `cStat 138` como "sem documentos" e para antes de persistir, mas na Distribuição DF-e **137 = nenhum documento** e **138 = documento(s) localizado(s)**; (b) o **worker não roda no Railway** (serviço único só sobe `server.ts`), então não há sync automático; (c) **não existe importação manual de XML** (o enum `OrigemCaptura` já prevê `upload_xml`, sem use case/rota). Cliente quer importação individual **e em lote**, cobrindo **NF-e (mod 55) + CT-e (mod 57)**.
2. **Relatórios.** Não há módulo de relatórios. Cliente quer: Faturamento/Vendas, Apuração de impostos, Entradas/Recebidas e Rankings/Curva ABC.
3. **Leiaute.** O logo "SIC NFe" some no menu porque o componente usa classes Tailwind **inexistentes** (`text-slateDark-fg/70`, `text-slateDark-muted` — `slateDark` não está no `tailwind.config.ts`). Mesmas classes inválidas aparecem em `Logo.tsx`, `AppLayout.tsx`, `ui/AlertDialog.tsx`, `ui/Dialog.tsx`. Cliente quer **varredura geral** de contraste/visibilidade.

## Parte 1 — Notas recebidas: sincronização + importação

### 1a. Corrigir o sync "0 documentos" (alta prioridade, causa confirmada)
- Em `SincronizarRecebidosUseCase`: **parar em `137`** (e lista vazia), **processar/persistir em `138`**. Corrigir o comentário.
- Propagar `lastCStat`/`xMotivo` para a resposta e **mostrar no toast** do `SyncDialogContent` (`InboxRecebidosPage.tsx`) — diagnóstico (137 vs 656 "consumo indevido" vs 138).
- Endurecer o parser `NFeDistribuicaoDFeService.ts`: corrigir os erros TS2638 (`'x' in root` sobre `{}`) com narrowing; **logar falhas de `decodeDocZip`** (hoje engolidas no `catch`), pois um decode quebrado também zera a captura.
- Opção **"reconsultar do zero"**: resetar o `NsuCursor` (cursor `sefaz_nfe_cte`) para `0` antes de sincronizar — cobre o caso de cursor que avançou indevidamente por bug anterior. (Botão/checkbox no diálogo + flag no use case.)

### 1b. Sync automático no Railway
- O `NFeDistribuicaoWorker` é agendado em `worker.ts`, que **não roda** no serviço único. Recomendado: **scheduler in-process** no boot do `server.ts` (gated por env `RECEPCAO_AUTO_SYNC=on` + intervalo), iterando empresas com certificado ativo e chamando `SincronizarRecebidosUseCase`. Alternativa: 2º serviço worker. Reusa o use case existente — sem duplicar lógica.

### 1c. Importação manual de XML (NF-e 55 + CT-e 57), individual e em lote
- **Backend**: `ImportarXmlRecebido` use case + controller + rota `POST /fiscal/recebidos/import` (aceita N XMLs base64). Parser novo `parseProcNFe` (NF-e completa: chave do `infNFe@Id`, `emit/CNPJ`+`xNome`, `total/ICMSTot/vNF`, `dhEmi`) e `parseCTe` (CT-e: `infCte`, `emit`, `vTPrest`); reusa `fast-xml-parser` (padrão do projeto) e `ReceivedDocumentRepository.upsertByChave` com `origemCaptura='upload_xml'`, guardando o XML completo em `xmlCompleto`. Retorna resumo `{ importados, duplicados, falhas[] }`.
- Validar: chave de 44 dígitos, modelo (55/57), CNPJ destinatário = empresa (aviso, não bloqueio).
- **Frontend**: botão **"Importar XML"** no `InboxRecebidosPage.tsx` + `input[type=file] multiple accept=".xml"`; usa `fileToBase64` (já existe em certificates-api) e mostra o resumo.

## Parte 2 — Relatórios

Novo módulo `Reports` (backend) + página `Relatórios` (frontend). Agregações SQL via `createQueryBuilder`/`getRawMany` sobre `nfes`, `nfe_items`, `received_documents` (sem novas tabelas). Filtros por **período** e empresa (X-Company-Id). Export **CSV** (PDF opcional/fase 2).

Quatro relatórios (priorizar **Faturamento** e **Apuração**, que dão mais valor; depois Entradas e Rankings):
- **Faturamento / Vendas**: NF-e autorizadas por período — total, por cliente, por produto, por status/CFOP.
- **Apuração de impostos**: somatórios de ICMS/ICMS-ST/IPI/PIS/COFINS/IBS/CBS/IS por período (livro de saídas).
- **Entradas / Recebidas**: `received_documents` por fornecedor/período/status.
- **Rankings / Curva ABC**: produtos mais vendidos e clientes que mais compram (a partir de `nfe_items`).

Rotas: `GET /reports/faturamento|apuracao|entradas|rankings?from&to`. Permissões: `nfe.read`/`fin.*`/`admin.full`. Item de menu "Relatórios" no `AppLayout.tsx`. Páginas usam `PageContainer`/`PageHeader` (padrão já criado).

## Parte 3 — Varredura de leiaute

- **Corrigir classes inválidas `slateDark-*`** nos 4 arquivos (Logo, AppLayout, AlertDialog, Dialog) → trocar por tokens definidos (`sidebar-foreground`, `sidebar-muted`, `white`, `slate-300`). Resolve o logo sumido no menu.
- **Auditoria de contraste/visibilidade**: varrer telas (sidebar, header, cards, formulários, diálogos) procurando texto sem cor, contraste baixo, itens cortados/escondidos (ex.: `overflow` em containers, `text-*` sobre fundo de mesma cor). Corrigir os achados. Verificação visual subindo o app nas telas principais.
- (Opcional) adicionar os tokens `slateDark` ao Tailwind se quiser manter o nome; preferível usar os tokens `sidebar-*` que já existem.

## Arquivos-chave
- Editar: `SincronizarRecebidosUseCase.ts`, `NFeDistribuicaoDFeService.ts`, `recepcao.routes.ts`, `InboxRecebidosPage.tsx`, `recepcao-api.ts`.
- Criar: `ImportarXmlRecebido` (use case+controller) + `parseProcNFe`/`parseCTe` em `infra/sefaz/` (ou `domain/`); módulo `Reports` (use cases + controllers + rotas) + `ReportsPage.tsx` + `reports-api.ts`; scheduler in-process (`shared/infra/scheduler` ou no `server.ts`).
- Editar (leiaute): `Logo.tsx`, `AppLayout.tsx`, `ui/AlertDialog.tsx`, `ui/Dialog.tsx`.

## Verificação
1. **Sync**: smoke do `/fiscal/recebidos/sync` (cert ativo) → conferir `lastCStat` retornado; com a correção 137/138, um CNPJ com notas deve capturar > 0. Testar "reconsultar do zero" zerando o cursor. tsc limpo.
2. **Import**: subir 1 XML de NF-e e 1 de CT-e (individual e em lote) → aparecem no inbox com origem "Upload XML"; reimportar o mesmo → conta como duplicado (upsert, sem duplicar).
3. **Relatórios**: cada endpoint com `from/to` retorna totais coerentes vs as NF-e do período; CSV abre no Excel; página renderiza com filtros.
4. **Leiaute**: logo "SIC NFe" visível no menu (expandido e colapsado); rodar `tsc` + abrir Dashboard/Clientes/Inbox e conferir que não há texto sumido.
5. Commit por parte; push (Railway rebuilda a imagem única).

## Riscos / observações
- **Escopo grande**: 3 features independentes. Sugiro entregar por partes — **1a (fix do sync)** primeiro (rápido e desbloqueia o cliente), depois 1c (import), Parte 3 (leiaute, baixo risco), e Parte 2 (relatórios) por último/faseado.
- **SEFAZ DF-e**: se após o fix o cStat vier **656 (consumo indevido)**, é bloqueio temporário (1h) por excesso de consultas — só aguardar; o scheduler deve respeitar intervalo mínimo (~1h) por empresa.
- **CT-e parsing**: layout diferente da NF-e; tratar como item de atenção no 1c.
- **Auto-sync in-process** acopla o job ao web; aceitável no serviço único. Se preferir isolamento, é o 2º serviço worker.

## Pendências anteriores (não relacionadas, registradas para não perder)
- **DANFE/XML**: o nome do produto no XML (`xProd`) e na DANFE sai com o **código** em vez da **descrição** — em `EmitirNFeUseCase.buildNfeDocument`/`createAggregate` o fallback é `src.product.codigo` e a descrição do produto não é usada (o objeto `product` no `__sourceItem` só expõe `codigo/ncm/cest`). Corrigir para usar `product.descricao`.

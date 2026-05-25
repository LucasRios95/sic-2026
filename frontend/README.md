# Sistema Fiscal-Financeiro — Frontend

Frontend React 19 para o sistema fiscal-financeiro. Esta versão cobre **Fase 0 + Fase 1a
(EP-09)** — login, multiempresa, cadastros base, upload de certificados A1, listagem de
NF-e, **emissão com pré-visualização tributária em tempo real**, detalhes com ações
completas do ciclo de vida (cancelar, CC-e, baixar DANFE, enviar por e-mail).

## Stack

- **React 19** com Strict Mode
- **Vite 6** + TypeScript strict
- **TanStack Router** com layout aninhado (`AppLayout` envolve as rotas autenticadas)
- **TanStack Query** (cache de dados servidor + invalidação por mutation)
- **Zustand** com `persist` (sessão local: tokens, usuário, empresa selecionada)
- **Tailwind CSS** + componentes UI próprios (Button, Input, Label, Card, Modal, Badge,
  Select, Textarea)

## Setup

```powershell
npm install
cp .env.example .env  # ajuste VITE_API_BASE_URL se o backend não estiver em localhost:3333
npm run dev
```

Abre em `http://localhost:5173`. Backend precisa estar em `localhost:3333` (ou no
endereço informado no `.env`).

## Mapa de rotas

| Rota | Componente | Descrição |
| --- | --- | --- |
| `/login` | `LoginPage` | E-mail + senha (`POST /auth/login`) |
| `/select-company` | `SelectCompanyPage` | Escolha de empresa quando há múltiplas |
| `/dashboard` | `DashboardPage` | Atalhos por permissão + perfil |
| `/fiscal/nfe` | `NFeListPage` | Listagem com filtros de status e busca |
| `/fiscal/nfe/new` | `NFeNewPage` | Emissão completa com preview tributário |
| `/fiscal/nfe/$id` | `NFeDetailsPage` | Detalhes + ações (cancelar/CC-e/DANFE/e-mail) |
| `/cadastros/customers` | `CustomersPage` | Listagem + criação rápida de cliente |
| `/cadastros/products` | `ProductsPage` | Listagem + criação com regra tributária inicial |
| `/admin/certificates` | `CertificatesPage` | Upload PFX + lista + revogação |

## Fluxo de emissão de NF-e

A `NFeNewPage` orquestra todo o fluxo end-to-end:

1. **Cliente**: seleção do destinatário cadastrado (e-mail usado depois para envio
   automático).
2. **Itens**: tabela com `Select` de produto + CFOP + quantidade + valor unitário.
   Botão "Adicionar item" e remoção pontual.
3. **Pagamento + certificado**: meio de pagamento e seleção do A1 ativo. Sem cert
   selecionado, NF-e fica em PENDING (não transmite).
4. **Pré-visualização tributária**: a cada mudança nos itens (debounced 400ms), chama
   `POST /tax/simulate` e mostra ICMS, ICMS-ST, DIFAL, IBS, CBS e total da nota.
   Badge "ano-teste 2026" aparece quando o motor está em modo simbólico.
5. **Avisos**: warnings do motor tributário aparecem em destaque (ex.: regra tributária
   ausente, MVA não cadastrada).
6. **Emissão**: gera `idempotencyKey` única por clique, chama `POST /nfe`, redireciona
   para a tela de detalhes.

## Tela de detalhes da NF-e

Status visual com `Badge` colorido (verde autorizada, vermelho rejeitada, etc.). Ações
disponíveis para NFe autorizada:

- **Baixar DANFE** — chama `POST /nfe/:id/danfe` e abre a URL assinada (TTL 15 min)
  numa nova aba.
- **Enviar por e-mail** — Modal com campo `to` opcional; default é `Customer.email`.
- **Carta de Correção** — Modal com texto (15-1000 chars) + seleção de certificado.
- **Cancelar** — Modal com justificativa (mín 15 chars). Botão fica desabilitado quando
  passou de 24h da autorização (orienta usar CC-e ou nota de devolução).

Timeline de eventos abaixo mostra cancelamentos, CC-e e seus protocolos SEFAZ.

## Tela de Certificados

- Upload de PFX via input file (convertido para base64 client-side).
- Lista com badge de status (`ativo`, `XXd restantes` em amarelo quando ≤ 30 dias,
  `revogado`).
- Modal de revogação com confirmação explícita.

## Estrutura

```
src/
├── env.ts
├── App.tsx                          — providers (Query, Router)
├── main.tsx
├── routes.tsx                       — árvore de rotas + AppLayout aninhado
├── features/
│   ├── auth/                        — login, logout, store Zustand
│   ├── certificates/                — upload, listar, revogar PFX
│   ├── companies/                   — listar empresas
│   ├── customers/                   — listar, criar cliente
│   ├── nfe/                         — emitir, listar, detalhes, eventos, DANFE, e-mail
│   └── products/                    — listar, criar produto com regra inicial
├── lib/
│   ├── api.ts                       — fetch wrapper + envelope
│   └── utils.ts                     — cn() helper
├── pages/                           — uma página por rota
└── shared/
    ├── components/
    │   ├── AppLayout.tsx            — sidebar + header + Outlet
    │   └── ui/                      — Button, Input, Label, Card, Badge, Modal, Select, Textarea
    ├── hooks/
    │   └── useDebounce.ts           — usado em /tax/simulate
    └── types/
        └── fiscal.ts                — tipos do domínio + estilos de status
```

## Comandos

```powershell
npm run dev          # dev server (HMR)
npm run build        # build de produção (tsc + vite build)
npm run preview      # serve build estática
npm run type-check   # tsc -b --noEmit
npm run lint
npm run format
```

## Pendências (registradas para iterações futuras)

- **Refinamento visual** das telas de NF-e (componentes shadcn customizados, dark mode).
- **Filtros avançados** na listagem (período, valor, cliente).
- **Exportação** Excel/CSV da listagem de NF-e (TSK-131 do Plano).
- **Auto-save** de rascunhos na composição (TSK-130).
- **Inutilização de numeração** com tela dedicada (atualmente só via API).
- **Upload de XML de NF-e externa** (TSK-160 — parte da Fase 1b).
- **Inbox de NF-e recebidas** (Fase 1b — recepção SEFAZ via NSU).

## Próximas fases

A próxima entrega frontend foca em recepção SEFAZ (NSU, manifestação) e NFS-e via
Focus NF-e — Fase 1b do Plano. Em paralelo no backend, **EP-06c** entrega contingência
EPEC + monitor automático de saúde SEFAZ por UF.

# Sistema Fiscal-Financeiro (sic-2026)

Substituição do legado Delphi/BDE/Paradox por uma plataforma fiscal-financeira web
preparada para a Reforma Tributária do Consumo (NF-e modelo 55 emitida diretamente
na SEFAZ, NFS-e via Focus NF-e, IBS/CBS/IS, multiempresa, RBAC).

> **Estado atual:** **Fase 0 + Fase 1a completa (EP-06 → EP-09 + EP-06c) + Fase 1b parcial
> (EP-10 + EP-11)** entregues — ciclo de vida COMPLETO da NF-e (emissão, cancelamento,
> CC-e, Inutilização, reconciliação automática, **auto-roteamento SVC + EPEC manual**),
> custódia produtiva de certificados A1, **monitor de saúde SEFAZ por autorizadora** com
> probe periódico, DANFE PDF + storage assinado + envio por e-mail, frontend React 19
> funcional com upload de certificado, cadastros, emissão de NF-e com preview tributário
> em tempo real, listagem com filtros e tela de detalhes com todas as ações do ciclo de
> vida, **recepção da SEFAZ** (`nfeDistribuicaoDFe` com cursor NSU por empresa + worker
> periódico) e **manifestação do destinatário** (Ciência, Confirmação, Desconhecimento,
> Operação não Realizada). Próximo passo: **EP-12..14 (importação manual, Focus NF-e,
> NFS-e)**. Veja `docs/Plano_Desenvolvimento_Sistema_Fiscal_v1.0.md`.

## Estrutura do repositório

```
sic-2026/
├── docs/                — PRD v1.3, Plano de Desenvolvimento v1.0, schema Prisma, fluxogramas UX
├── backend/             — Node.js LTS · TypeScript · Express 5 · TypeORM 0.3 · Postgres 16 · tsyringe
└── frontend/            — React 19 · Vite 6 · TanStack Router/Query · Tailwind
```

## Como rodar tudo

### Opção 1 (recomendada) — Stack completa em Docker com hot-reload

Único pré-requisito: **Docker Desktop** (ou Docker Engine + Docker Compose v2).

```powershell
# Da raiz do repo:
docker compose up -d

# Acompanhar logs:
docker compose logs -f backend          # API
docker compose logs -f worker           # workers (filas BullMQ)
docker compose logs -f frontend         # Vite dev server
```

Sobe **6 containers**: `postgres`, `redis`, `migrate` (one-shot — roda migrations + seed
e sai), `backend` (API em :3333), `worker` (filas), `frontend` (Vite em :5173).

Bind mount do código → editar `.ts`/`.tsx` no host recompila automaticamente dentro do
container (tsx watch + Vite HMR). `node_modules` ficam em volumes nomeados para evitar
conflito de binários compilados entre host e container.

```powershell
docker compose down       # para sem apagar dados
docker compose down -v    # ⚠ apaga banco + Redis (perde tudo)
docker compose exec backend sh    # shell no container backend
docker compose exec backend npm test    # roda testes dentro do container
```

Acessos:

| Serviço | URL / host:porta |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3333 |
| Postgres | `localhost:5432` (user/pass: `postgres`/`postgres`, db: `sic_2026`) |
| Redis | `localhost:6379` |

Variáveis de ambiente sobrescritas (opcionais) — basta exportar antes do `docker compose up`:

```powershell
$env:JWT_SECRET = "uma-string-aleatoria-com-pelo-menos-32-caracteres-em-prod"
$env:VAULT_DRIVER = "filesystem"
$env:VAULT_MASTER_KEY = "<32 bytes em base64>"
$env:LOG_LEVEL = "info"
docker compose up -d
```

### Opção 2 — Sem Docker (rodar tudo localmente)

Requer Node.js 22.x + Postgres 16 + Redis rodando localmente.

```powershell
# Terminal 1 — backend
cd backend
npm install
cp .env.example .env  # ajuste JWT_SECRET (mínimo 16 chars) e DB/Redis
npm run migration:run
npm run seed          # cria admin@sic.local / Admin@123
npm run dev           # http://localhost:3333

# Terminal 2 — workers
cd backend
npm run worker

# Terminal 3 — frontend
cd frontend
npm install
cp .env.example .env
npm run dev           # http://localhost:5173
```

Faça login com `admin@sic.local` / `Admin@123` e explore o dashboard placeholder.

Detalhes de setup, endpoints e arquitetura estão nos READMEs de cada pacote:

- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)

## Princípios arquiteturais aplicados

- **Clean Architecture + SOLID** — Domain (entidades, ports), Application (use cases),
  Infrastructure (TypeORM, providers, HTTP), Presentation (controllers, middlewares).
- **DI via tsyringe** — toda dependência externa é resolvida em runtime, viabilizando
  testes com mocks e troca futura de adapters (cofre, fila, gateway fiscal) sem
  reescrita de use cases.
- **Tributação como dados, não código** — entidades já preparam o terreno para o motor
  tributário versionado por vigência (flags `usaIcms*` na empresa; campos `validFrom`/
  `validTo` nas próximas entidades de regra). Decisão do PRD seção 6.1.1.
- **Multiempresa nativa** — toda tabela transacional carregará `companyId` desde o
  primeiro módulo fiscal. Acesso é segregado via RBAC com escopo opcional por empresa.

## Próximas fases

| Fase | EP | Conteúdo | Pts |
| --- | --- | --- | --- |
| 1a | EP-08b | Refinamento visual DANFE (revisão fiscal) + adapter S3 do storage | 8 |
| 1b | EP-12 | Importação manual XML/PDF (com OCR) | ~20 |
| 1b | EP-13 | Cliente Focus NF-e + camada anticorrupção (NFS-e municipal) | ~20 |
| 1b | EP-14 | Emissão NFS-e (Nacional + municipal via Focus) | ~25 |
| 1c | EP-15..18 | Relatórios mensais + apuração assistida + fechamento mensal | 110–140 |

Consulte [`docs/Plano_Desenvolvimento_Sistema_Fiscal_v1.0.md`](docs/Plano_Desenvolvimento_Sistema_Fiscal_v1.0.md)
para o backlog completo (180–220 pts/fase, total 680–830 pts no MVP de 2026).

# Sistema Fiscal-Financeiro (sic-2026)

Substituição do legado Delphi/BDE/Paradox por uma plataforma fiscal-financeira web
preparada para a Reforma Tributária do Consumo (NF-e modelo 55 emitida diretamente
na SEFAZ, NFS-e via Focus NF-e, IBS/CBS/IS, multiempresa, RBAC).

> **Estado atual:** **Fase 0 + Fase 1a (EP-06 → EP-09)** entregues — ciclo de vida COMPLETO
> da NF-e (emissão, cancelamento, CC-e, Inutilização, reconciliação automática), custódia
> produtiva de certificados A1, DANFE PDF + storage assinado + envio por e-mail, **e
> frontend React 19 funcional com upload de certificado, cadastros, emissão de NF-e com
> preview tributário em tempo real, listagem com filtros e tela de detalhes com todas as
> ações do ciclo de vida**. Próximo passo: **Fase 1b (recepção SEFAZ + NFS-e via Focus
> NF-e)**. Veja `docs/Plano_Desenvolvimento_Sistema_Fiscal_v1.0.md`.

## Estrutura do repositório

```
sic-2026/
├── docs/                — PRD v1.3, Plano de Desenvolvimento v1.0, schema Prisma, fluxogramas UX
├── backend/             — Node.js LTS · TypeScript · Express 5 · TypeORM 0.3 · Postgres 16 · tsyringe
└── frontend/            — React 19 · Vite 6 · TanStack Router/Query · Tailwind
```

## Como rodar tudo

```powershell
# Terminal 1 — backend
cd backend
docker compose up -d
npm install
cp .env.example .env  # ajuste JWT_SECRET (mínimo 16 chars)
npm run migration:run
npm run seed          # cria admin@sic.local / Admin@123
npm run dev           # http://localhost:3333

# Terminal 2 — frontend
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
| 1a | EP-06c | Contingência EPEC + monitor de saúde SEFAZ por UF | 12 |
| 1a | EP-08b | Refinamento visual DANFE (revisão fiscal) + adapter S3 do storage | 8 |
| 1b | EP-10..14 | Recepção SEFAZ (NSU + manifestação) + NFS-e via Focus NF-e | ≥75 |
| 1c | EP-15..18 | Relatórios mensais + apuração assistida + fechamento mensal | 110–140 |

Consulte [`docs/Plano_Desenvolvimento_Sistema_Fiscal_v1.0.md`](docs/Plano_Desenvolvimento_Sistema_Fiscal_v1.0.md)
para o backlog completo (180–220 pts/fase, total 680–830 pts no MVP de 2026).

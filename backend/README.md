# Sistema Fiscal-Financeiro — Backend

> Substituição do legado Delphi/BDE/Paradox por uma plataforma fiscal-financeira web
> preparada para a Reforma Tributária (NF-e modelo 55 direto SEFAZ + NFS-e via Focus NF-e,
> IBS/CBS/IS, multiempresa, RBAC). Esta entrega cobre **Fase 0 (EP-01 a EP-05) + Fase 1a
> (EP-06, EP-06b, EP-07, EP-07b, EP-08)** do Plano de Desenvolvimento v1.0 — fundação
> técnica, motor tributário, ciclo de vida COMPLETO da NF-e (emissão, cancelamento, CC-e,
> Inutilização, reconciliação automática), custódia produtiva de certificados A1 e
> **DANFE em React-PDF + storage com URLs assinadas + envio automático por e-mail**
> (XML + DANFE) para o destinatário.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Runtime | Node.js LTS (≥ 22.x) |
| Linguagem | TypeScript 5.x (strict) |
| API | Express 5 |
| ORM | TypeORM 0.3 |
| Banco | PostgreSQL 16 |
| DI | tsyringe |
| Validação | Zod |
| Logger | Pino (estruturado, com AsyncLocalStorage para requestId) |
| Testes | Vitest |
| Auth | JWT (access 15 min) + Refresh tokens opacos rotativos |

## Estrutura

```
src/
├── config/                       — env (Zod), auth
├── modules/
│   ├── Auth/                     — login, refresh, logout, me
│   ├── Tenants/                  — tenant raiz
│   ├── Companies/                — empresa (com flags fiscais) + filial
│   ├── Users/                    — usuário + refresh tokens
│   ├── AccessControl/            — Role, Permission, UserRole, RolePermission (RBAC)
│   ├── Customers/                — clientes com atributos fiscais (PRD 6.1.1.2)
│   ├── Suppliers/                — fornecedores (com crtFornecedor e produtorRural)
│   ├── Products/                 — produtos + ProductTaxRule versionada
│   ├── Services/                 — serviços + ServiceTaxRule versionada
│   ├── TaxEngine/                — motor tributário + tabelas globais (EP-04)
│   │   ├── calculadoras/         — ICMS/ICMS-ST/DIFAL/FCP/IPI/PIS-COFINS/IBS-CBS
│   │   ├── domain/               — ContextoCalculo, ResultadoCalculo, interfaces
│   │   ├── infra/typeorm/        — Interstate/IcmsInterna/IcmsStMva/Beneficio/TaxParameter
│   │   └── MotorTributario.ts    — pipeline orquestrador
│   ├── Auditoria/                — AuditLog append-only + AuditService (EP-05)
│   └── Notifications/            — inbox por usuário/empresa (EP-05)
└── shared/
    ├── container/                — DI tsyringe + providers (Hash, Token, Queue, Vault)
    ├── context/                  — AsyncLocalStorage (requestId, userId, companyId)
    ├── domain/                   — utilidades de domínio (validity-window, Money…)
    ├── infra/queues/             — BaseWorker BullMQ
    ├── telemetry/                — OpenTelemetry opt-in (OTLP HTTP)
    ├── errors/                   — AppError + subtipos (NotFound, Validation, BusinessRule, …)
    ├── infra/
    │   ├── http/                 — app, server, routes, middlewares
    │   └── typeorm/              — DataSource, migrations, seeds, BaseEntity
    ├── logger/                   — Pino
    ├── types/                    — augmentação do Express + enums fiscais compartilhados
    └── utils/                    — document-validators (CPF/CNPJ), normalizadores
tests/
└── unit/                         — testes unitários por camada
```

Cada módulo segue o padrão `{dtos, infra/{typeorm/{entities,repositories}, http/{routes,validators}}, repositories, useCases/<UC>/{UseCase, Controller}}`.

## Pré-requisitos

- Node.js 22.x (use `.nvmrc` se tiver `nvm`)
- Docker + Docker Compose (para subir Postgres + Redis localmente)
- npm 10+ (vem com Node)

## Setup

```powershell
# 1. Instalar dependências
npm install

# 2. Subir Postgres e Redis locais
docker compose up -d

# 3. Copiar variáveis de ambiente
cp .env.example .env  # ajuste valores conforme necessário (JWT_SECRET é obrigatório)

# 4. Rodar migrations
npm run migration:run

# 5. Rodar seed (cria permissões, papéis padrão e admin@sic.local / Admin@123)
npm run seed

# 6. Subir a aplicação em modo dev
npm run dev
```

A API responde em `http://localhost:3333`. Health check: `GET /health`.

## Endpoints principais

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Status do serviço |
| `GET` | `/health/ready` | — | Status do serviço + conexão com banco |
| `POST` | `/auth/login` | — | Login com email + senha. Retorna access token + refresh token |
| `POST` | `/auth/refresh` | — | Rotação de refresh token |
| `POST` | `/auth/logout` | — | Revoga o refresh token informado |
| `GET` | `/auth/me` | JWT | Contexto do usuário autenticado (perms, empresas) |
| `GET` | `/companies` | JWT | Lista empresas acessíveis pelo usuário no tenant |
| `POST` | `/companies` | JWT + `company.create` ou `admin.full` | Cria empresa com flags fiscais |
| `POST` | `/users` | JWT + `user.create` ou `admin.full` | Cria usuário no tenant |
| `GET` | `/customers` | JWT + `catalog.read` + `X-Company-Id` | Lista clientes da empresa (paginação + busca) |
| `GET` | `/customers/:id` | JWT + `catalog.read` + `X-Company-Id` | Detalhes do cliente |
| `POST` | `/customers` | JWT + `catalog.write` + `X-Company-Id` | Cria cliente (CPF/CNPJ validados) |
| `PUT` | `/customers/:id` | JWT + `catalog.write` + `X-Company-Id` | Atualiza dados não-identitários |
| `DELETE` | `/customers/:id` | JWT + `catalog.write` + `X-Company-Id` | Soft delete |
| `GET`/`POST`/`PUT`/`DELETE` | `/suppliers` | idem clientes | Idem para fornecedores (com `crtFornecedor`) |
| `GET` | `/products` | JWT + `catalog.read` + `X-Company-Id` | Lista produtos (filtro por NCM, busca) |
| `GET` | `/products/:id` | JWT + `catalog.read` + `X-Company-Id` | Produto + histórico de regras tributárias |
| `POST` | `/products` | JWT + `catalog.write` + `X-Company-Id` | Cria produto (opcionalmente com `initialTaxRule`) |
| `PUT` | `/products/:id` | JWT + `catalog.write` + `X-Company-Id` | Atualiza atributos não-fiscais |
| `DELETE` | `/products/:id` | JWT + `catalog.write` + `X-Company-Id` | Soft delete (rejeitado se houver regra vigente/futura) |
| `POST` | `/products/:id/tax-rules` | JWT + `tax-rule.write` ou `catalog.write` + `X-Company-Id` | Adiciona regra tributária (sobreposição de vigência é rejeitada) |
| `GET`/`POST`/`PUT`/`DELETE` | `/services` + `/services/:id/tax-rules` | idem produtos | Idem para serviços (ISS + IBS/CBS na NFS-e) |
| `POST` | `/tax/simulate` | JWT + `catalog.read` ou `nfe.emit` + `X-Company-Id` | Simula tributação de uma operação (cliente + itens) sem persistir; retorna memória de cálculo + totais. Usado para preview no front. |
| `GET` | `/notifications` | JWT + `X-Company-Id` | Inbox do usuário na empresa atual (filtro `onlyUnread`, `category`). Retorna `meta.unread`. |
| `PATCH` | `/notifications/:id/read` | JWT + `X-Company-Id` | Marca uma notificação como lida. |
| `PATCH` | `/notifications/read-all` | JWT + `X-Company-Id` | Marca todas as não lidas como lidas; retorna `{ updated: N }`. |
| `GET` | `/audit-logs` | JWT + `audit.read` ou `admin.full` | Trilha de auditoria (filtros por user/entity/action/janela). |
| `POST` | `/nfe/status-servico` | JWT + `nfe.emit` ou `admin.full` + `X-Company-Id` | Smoke test SEFAZ (cStat 107 = serviço em operação). Valida certificado + mTLS + envelope SOAP. |
| `GET` | `/nfe` | JWT + `nfe.read` ou `nfe.emit` + `X-Company-Id` | Lista NF-e da empresa (status, período, cliente). |
| `GET` | `/nfe/:id` | JWT + `nfe.read` ou `nfe.emit` + `X-Company-Id` | Detalhes da NF-e + itens + eventos + pagamentos. |
| `POST` | `/nfe` | JWT + `nfe.emit` ou `admin.full` + `X-Company-Id` | **Emite NF-e end-to-end** (idempotência + numeração atômica + motor tributário + composição XML + assinatura + transmissão SEFAZ + persistência). |
| `POST` | `/nfe/:id/cancel` | JWT + `nfe.cancel` ou `admin.full` + `X-Company-Id` | Cancela NF-e dentro do prazo legal (24h). Justificativa mínima 15 chars. |
| `POST` | `/nfe/:id/cce` | JWT + `nfe.cce` ou `admin.full` + `X-Company-Id` | Emite Carta de Correção Eletrônica (até 20 por NF-e, vale a última). Texto 15-1000 chars. |
| `POST` | `/nfe/inutilizar` | JWT + `nfe.cancel` ou `admin.full` + `X-Company-Id` | Inutiliza faixa de numeração NÃO usada (apenas números virgens). |
| `GET` | `/certificates` | JWT + `vault.read` ou `vault.write` ou `admin.full` + `X-Company-Id` | Lista certificados da empresa (metadata, sem vaultRef). |
| `POST` | `/certificates` | JWT + `vault.write` ou `admin.full` + `X-Company-Id` | Upload de PFX (base64) + senha. Valida CNPJ titular, expiração, duplicidade. |
| `DELETE` | `/certificates/:id` | JWT + `vault.write` ou `admin.full` + `X-Company-Id` | Revoga certificado (marca inativo + remove do cofre). |

### Modelo de envelope HTTP

Sucesso:
```json
{ "data": { ... } }
```

Erro:
```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { ... } },
  "requestId": "0193b6f4-..."
}
```

O `requestId` (UUID v7) é gerado por requisição e propagado via header `x-request-id`
(in/out) e via `AsyncLocalStorage` para todos os logs estruturados do request.

## Multiempresa & RBAC

- Cada **usuário** pertence a um **tenant** (organização).
- Um tenant pode operar várias **empresas** (CNPJs distintos com flags fiscais próprias).
- O vínculo papel↔empresa é por `UserRole(userId, roleId, companyId)`. Quando `companyId`
  é o UUID sentinela `00000000-0000-0000-0000-000000000000`, o papel se aplica a todas
  as empresas do tenant ("acesso global").
- Em rotas transacionais, o middleware `tenantContext({ required: true })` exige header
  `X-Company-Id` e valida o acesso. Em rotas administrativas, é opcional.

### Flags de habilitação tributária (PRD 6.1.1.1)

A entidade `Company` carrega seis flags que controlam quais cálculos o motor tributário
aplica àquela empresa:

| Flag | Quando habilitar |
| --- | --- |
| `usaIcms` | Empresas que operam com mercadorias (padrão habilitada) |
| `usaIcmsSt` | Substituição Tributária (autopeças, bebidas, cosméticos, etc.) |
| `usaIpi` | Indústrias e equiparadas |
| `usaDifal` | Operações interestaduais com consumidor final |
| `usaFcp` | Fundo de Combate à Pobreza |
| `usaIcmsDesonerado` | Isenção/redução com desoneração |

Empresas sem `usaIcmsSt = true`, por exemplo, não recebem cálculo de ST mesmo se o produto
tiver MVA cadastrada. Permite atender perfis muito diferentes (mercearia ≠ indústria ≠
distribuidor interestadual) no mesmo banco sem código condicional disperso.

## Catálogo de permissões e papéis

Permissões são identificadas por `<namespace>.<acao>` (`nfe.emit`, `fin.payable.write`,
`admin.full`). O seed cria os 6 papéis pré-definidos do PRD seção 5.2:

- **Administrador** — `admin.full`
- **Gestor** — leitura ampla
- **Faturista** — emissão/cancelamento de NF-e e NFS-e
- **Fiscal** — manifestação, escrituração, parâmetros tributários
- **Compras** — entradas
- **Financeiro** — contas a pagar/receber

Lista completa em `src/shared/infra/typeorm/seeds/permissions.ts`.

## Cadastros base (EP-03)

Entidades implementadas conforme PRD 6.1.1 e o schema Prisma v1.3:

| Entidade | Destaques fiscais |
| --- | --- |
| **Customer** | `crtDestinatario`, `consumidorFinal`, `indicadorPresenca`, `indicadorIE`, `suframa`, `codigoPais`, `codigoMunicipioIbge`. Aceita PJ (CNPJ válido), PF (CPF válido) ou ESTRANGEIRO (identificador opaco). |
| **Supplier** | `crtFornecedor` (afeta apropriação de crédito IBS/CBS), `produtorRural`. |
| **Product** | NCM 8 dígitos, CEST 7 dígitos, `origem` 0..8 (origens 1/2/3/5/6/7/8 disparam alíquota interestadual de 4%). Soft delete não permitido enquanto houver `ProductTaxRule` vigente ou futura. |
| **ProductTaxRule** | Regra tributária versionada por `[validFrom, validTo)`. Cobre ICMS próprio, ICMS-ST (com MVA e redução), ICMS desonerado, FCP, IPI (com modo por unidade), PIS/COFINS e a Reforma (IBS/CBS/IS com `cstIbsCbs` e `cClassTrib`). Sobreposição de vigências é rejeitada. |
| **Service** | Item da Lista de Serviços (LC 116/2003) validado, `codigoTributacaoNacional` (cTribNac) e municipal. |
| **ServiceTaxRule** | ISS (transição) + IBS/CBS + retenções federais (PIS/COFINS/CSLL/INSS/IR). Mesma invariante de vigência sem sobreposição. |

A regra "vigente em D" é resolvida pelos repositórios via consulta indexada
(`validFrom ≤ D AND (validTo IS NULL OR validTo > D)`). O motor tributário (EP-04)
consome esses dados sem precisar conhecer a estrutura interna do versionamento.

## Motor tributário (EP-04)

Pipeline de calculadoras independentes, executadas em ordem fixa:

1. **CalculadoraIcmsProprio** — intra/interestadual (Senado 22/89 + 13/2012), redução de
   base, importado, desoneração (motDesICMS + vICMSDeson).
2. **CalculadoraIcmsSt** — Substituição Tributária com MVA original ou ajustada (Convênio
   ICMS 35/2011), fallback para `pMVAST` do produto quando não há regra global em `icms_st_mva`.
3. **CalculadoraDifal** — Diferencial de Alíquotas em operações interestaduais B2C
   (EC 87/2015, LC 190/2022). Empresa precisa de `usaDifal = true`.
4. **CalculadoraFcpDestino** — Fundo de Combate à Pobreza da UF de destino quando DIFAL
   aplica e a UF instituiu FCP.
5. **CalculadoraIpi** — modo padrão (base × alíquota) e por unidade (cigarros, bebidas).
6. **CalculadoraPisCofins** — vigência até 31/12/2026; consulta `pis_cofins.encerramento`
   no `TaxParameter` para decidir se ainda aplica.
7. **CalculadoraIbsCbs** — Reforma Tributária. Carrega `ibs.aliquota.padrao` e
   `cbs.aliquota.padrao` do `TaxParameter` (empresa-específico tem precedência sobre
   global), respeita o modo `ANO_TESTE` (2026 = destaque sem recolhimento) vs. `PLENO`
   (2027+). Alíquota do produto sobrescreve a global quando cadastrada.

**Princípios fixados:**

- **Tributação como dados, não código** — alíquotas, MVAs e benefícios mudam por dados
  versionados, sem deploy (PRD 1.5 / 9 / TSK-074 do Plano).
- **Idempotência** — mesma entrada produz mesma saída; nenhum efeito colateral.
- **Configuração faltante vira aviso, não exception** — o resultado carrega `warnings[]`
  para que o faturista veja exatamente o que está pendente.
- **Memória de cálculo auditável** — cada item retorna um array `memoria[]` com o passo
  aplicado por cada calculadora (entrada, fator, alíquota) — base para a "memória de
  cálculo recuperável" exigida no Plano (TSK-071).

### Tabelas globais alimentadas pelo seed (2026)

| Tabela | Cobertura inicial |
| --- | --- |
| `interstate_aliquots` | Todos os pares UF→UF (27 × 26 = 702 entradas) com nacional (7% ou 12%) e importado (4%). |
| `icms_interna_uf` | Alíquota interna geral + FCP por UF para as 27 UFs. |
| `tax_parameters` | `ibs.aliquota.padrao` 0,1% ano-teste · `cbs.aliquota.padrao` 0,9% ano-teste · `cbs.aliquota.padrao` 8,8% pleno (2027+) · `pis_cofins.encerramento` 01/01/2027. |
| `icms_st_mva` | Vazia — alimentada por protocolos Confaz pela equipe fiscal. |
| `beneficios_fiscais_uf` | Vazia — alimentada conforme demanda por UF/produto. |

### Exemplo de uso (`POST /tax/simulate`)

```json
{
  "destinatario": {
    "uf": "AM",
    "consumidorFinal": true,
    "indicadorIE": "NAO_CONTRIBUINTE"
  },
  "itens": [
    {
      "itemId": "linha-1",
      "productId": "01927ab6-...",
      "quantidade": "1",
      "valorUnitario": "100.00",
      "cfop": "6108"
    }
  ]
}
```

Resposta inclui `itens[].memoria` com o passo aplicado por cada calculadora e
`totais.modoAnoTesteIbsCbs` indicando se IBS/CBS foram destacados sem recolhimento.

## Infraestrutura compartilhada (EP-05)

### Filas BullMQ

- [QueueProvider](src/shared/container/providers/QueueProvider/IQueueProvider.ts) com filas
  pré-registradas: `audit-async`, `nfe-emit`, `nfe-distribuicao`, `focus-webhook`,
  `import-xml`, `reports`. Implementação [BullMqQueueProvider](src/shared/container/providers/QueueProvider/implementations/BullMqQueueProvider.ts)
  conecta `lazyConnect: true` ao Redis — a app sobe mesmo sem Redis disponível em dev.
- Política padrão: 5 tentativas, exponential backoff começando em 5s. Jobs concluídos
  ficam 24h em memória do Bull; falhados ficam 30 dias para investigação.
- [BaseWorker](src/shared/infra/queues/BaseWorker.ts) abstrato propaga `requestId` via
  AsyncLocalStorage e expõe hook `onFailedFinal` para notificar humanos. Workers
  concretos entram na Fase 1 (ex.: `nfe-emit` para transmissão SEFAZ).

### Cofre de segredos

- [ICertificateVault](src/shared/container/providers/CertificateVault/ICertificateVault.ts)
  abstrai custódia de e-CNPJ A1, tokens Focus, credenciais bancárias.
- Adapters:
  - `InMemoryCertificateVault` — testes/dev efêmero, perde tudo no restart.
  - `FileSystemCertificateVault` — persiste em disco com AES-256-GCM. Cada certificado
    em arquivo JSON criptografado com IV único e tag de autenticação. Chave-mestra
    (`VAULT_MASTER_KEY`, 32 bytes base64) injetável via env ou construtor.
- Driver selecionado por env (`VAULT_DRIVER=memory|filesystem`). Em produção, trocar
  por adapter dedicado (HashiCorp Vault / AWS Secrets Manager) — basta registrar a
  nova implementação no container.
- Conteúdo bruto NUNCA é persistido em banco; apenas `vaultRef` opaco vai na coluna
  `certificates.vault_ref` / `integration_credentials.vault_ref`.

### OpenTelemetry (opt-in)

- Quando `OTEL_EXPORTER_OTLP_ENDPOINT` está vazio, [telemetry/opentelemetry.ts](src/shared/telemetry/opentelemetry.ts)
  retorna no-op imediatamente — zero overhead em dev.
- Quando configurado, inicializa auto-instrumentações para Express, HTTP, ioredis, pg e
  exporta traces via OTLP HTTP (compatível com Tempo, Jaeger, Datadog, Honeycomb).
- `service.name` e `deployment.environment` são populados como resource attributes
  para facilitar filtros nos backends de observabilidade.

### AuditLog append-only

- Tabela `audit_logs` sem método de UPDATE/DELETE no repositório (append-only por
  convenção do código). Em produção, complementa-se com `REVOKE UPDATE, DELETE` no
  role da aplicação.
- [AuditService](src/modules/Auditoria/AuditService.ts) injetável: use cases chamam
  `record({ action: 'nfe.emit', entityType: 'nfe', entityId })`. Service enriquece
  `userId/companyId/requestId` automaticamente via `AsyncLocalStorage` (caller
  só precisa dizer o "quê").
- Degradação graciosa: falha ao gravar audit log NÃO derruba a operação principal.

### Notifications inbox

- [Notification](src/modules/Notifications/infra/typeorm/entities/Notification.ts) por
  usuário (`userId` definido) ou broadcast para a empresa (`userId IS NULL`).
- Severity `info/warn/error`. Categorias livres: `rejection`, `cert_expiry`,
  `manifest_pending`, `contingency_started`, etc.
- Índice parcial `WHERE read_at IS NULL` otimiza o caso quente "minhas não lidas".
- [NotificationService](src/modules/Notifications/NotificationService.ts) com atalhos
  `info()/warn()/error()` para os workers e use cases das próximas fases.

### Variáveis de ambiente novas

```bash
# Redis (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
QUEUE_PREFIX=sic2026

# Cofre de segredos
VAULT_DRIVER=filesystem            # memory | filesystem
VAULT_PATH=./tmp/vault
VAULT_MASTER_KEY=<32 bytes base64> # gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# OpenTelemetry (opt-in)
OTEL_EXPORTER_OTLP_ENDPOINT=       # vazio = desativado
OTEL_SERVICE_NAME=sic-2026-backend
```

## Comandos

```powershell
npm run dev               # dev com reload (tsx)
npm run build             # build para dist/
npm start                 # subir dist/
npm test                  # testes unitários (Vitest)
npm run test:coverage     # cobertura
npm run lint              # ESLint
npm run type-check        # tsc --noEmit
npm run migration:run     # aplicar migrations pendentes
npm run migration:show    # listar status das migrations
npm run migration:revert  # reverter a última migration
npm run seed              # popular permissões/papéis/admin
```

## Próximas fases (Plano de Desenvolvimento)

A fundação implementada nesta entrega habilita o restante da **Fase 1a** do Plano:

- ✅ **EP-06** — Cliente SOAP SEFAZ + assinatura XML-DSig + roteamento por UF.
- ✅ **EP-06b** — Custódia de certificado A1: upload com inspeção, resolver por banco,
  alerta de expiração 60/30/7 dias.
- ✅ **EP-07** — `EmitirNFe` end-to-end + cancelamento + idempotência + numeração atômica.
- ✅ **EP-07b** — Worker de reconciliação, CC-e (até 20 por NF-e), Inutilização.
  Pendências: eventos Ator Interessado/Insucesso na Entrega (TSK-114), contingência EPEC
  (TSK-115).
- **EP-08** — DANFE em PDF (React-PDF) + envio por email + object storage.
- **EP-09** — Frontend de emissão de NF-e (consome `POST /tax/simulate` para preview).

Calculadora de Imposto Seletivo (IS) com vigência 2027+ e calculadora de ISS +
retenções federais para serviços entram junto com a Fase 1b (NFS-e via Focus NF-e).

## Integração SEFAZ (EP-06)

### Componentes

| Componente | Responsabilidade |
| --- | --- |
| [ChaveAcesso](src/modules/NFe/domain/ChaveAcesso.ts) | Compõe a chave de 44 dígitos (cUF+AAMM+CNPJ+modelo+série+nNF+tpEmis+cNF+DV) com módulo 11. |
| [NFeXmlBuilder](src/modules/NFe/domain/NFeXmlBuilder.ts) | Compõe o XML 4.00 (ide, emit, dest, det, total, transp, pag, infAdic) com grupos novos da Reforma (IBSCBS, IBSCBSTot, IS). |
| [NFeSigner](src/modules/NFe/infra/signing/NFeSigner.ts) | Assina XML-DSig com C14N exclusiva + RSA-SHA256, faz round-trip de verificação antes de devolver. |
| [SefazEndpoints](src/modules/NFe/infra/sefaz/SefazEndpoints.ts) | Tabela UF→autorizadora + ambiente (SP, RS, MG, BA, AM próprias; outras → SVRS/SVAN). Roteamento de contingência SVC-AN/SVC-RS. |
| [SefazSoapClient](src/modules/NFe/infra/sefaz/SefazSoapClient.ts) | HTTPS+mTLS com cert do cofre, envelope SOAP 1.2, retry transitório (5xx/network), persistência em SefazTransmission. |
| [SefazTransmission](src/modules/NFe/infra/typeorm/entities/SefazTransmission.ts) | Auditoria append-only de toda transmissão (request/response XML, cStat, latência). |

### Como testar a integração SEFAZ

Para validar a integração end-to-end em homologação SEFAZ-SP (recomendado antes do EP-07):

1. **Suba uma empresa de teste** com CRT 3 (regime normal) e CNPJ válido.
2. **Obtenha um certificado A1 de homologação** (Receita Federal aceita auto-assinados em
   ambiente de homologação SEFAZ; em produção, exige certificado emitido por AC ICP-Brasil).
3. **Suba o PFX no cofre** via método interno (endpoint de upload fica para iteração futura):

   ```typescript
   const vault = container.resolve<ICertificateVault>('CertificateVault');
   const stored = await vault.store({
     metadata: { alias: 'Homologação SP', type: 'A1', ... },
     content: fs.readFileSync('cert.pfx'),
     password: 'senha-do-pfx',
   });
   // stored.vaultRef → guardar para usar em /nfe/status-servico
   ```

4. **Chame `POST /nfe/status-servico`** com o `vaultRef`. Resposta esperada:

   ```json
   { "data": { "cStat": "107", "xMotivo": "Servico em Operacao", "durationMs": 1234 } }
   ```

## Emissão de NF-e end-to-end (EP-07)

### Fluxo de `POST /nfe`

```
        ┌────────────────────────────────────────────────────────────────┐
        │ Cliente envia { idempotencyKey, customerId, itens, pagamentos } │
        └─────────────────────────────┬──────────────────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 1. Idempotência                         │
                  │    NFeRepository.findByIdempotencyKey() │
                  └───────────────────┬────────────────────┘
                                      │ não existe ainda
                  ┌───────────────────▼────────────────────┐
                  │ 2. Reserva número (lock pessimista)    │
                  │    NumberingSeriesRepository           │
                  │    .allocateNumber(company, '55', S)   │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 3. Compõe ChaveAcesso (44 dígitos)     │
                  │    cUF+AAMM+CNPJ+modelo+série+nNF+...  │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 4. Calcula tributos                    │
                  │    MotorTributario.calcular(contexto)  │
                  │    → ICMS, ST, DIFAL, FCP, IPI, PIS,   │
                  │      COFINS, IBS, CBS, IS              │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 5. Persiste agregado (PENDING)         │
                  │    NFeRepository.createAggregate()     │
                  │    → NFe + items + pagamentos          │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 6. Compõe XML (NFeXmlBuilder)           │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 7. Assina XML-DSig (NFeSigner)         │
                  │    C14N exclusiva + RSA-SHA256          │
                  │    + round-trip de verificação local    │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 8. Transmite (SefazSoapClient)         │
                  │    NFeAutorizacao4 + mTLS + envelope   │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 9. Atualiza NFe.status:                │
                  │    cStat 100 → AUTHORIZED               │
                  │    cStat 110/205/301/302 → DENIED      │
                  │    outros 5xx → REJECTED               │
                  │    timeout/network → PROCESSING        │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │ 10. AuditService.record + Notification  │
                  │     em caso de rejeição                 │
                  └────────────────────────────────────────┘
```

### Garantias técnicas

| Invariante | Implementação |
| --- | --- |
| Mesma `idempotencyKey` → mesma NFe | Constraint unique no banco + check inicial no use case |
| Numeração nunca duplicada em concorrência | `SELECT ... FOR UPDATE` em `numbering_series` dentro de transação |
| `(companyId, modelo, série, número)` único | Unique index composto na tabela `nfes` |
| Chave de acesso única quando autorizada | Unique index parcial `WHERE chave_acesso IS NOT NULL` |
| Assinatura íntegra antes de transmitir | Round-trip de verificação local no `NFeSigner` |
| Falha de transmissão não perde a NF-e | Persistência ANTES de transmitir; status fica PROCESSING e fica disponível para retentativa |
| Cancelamento respeita prazo legal | Diff `dhAutorizacao` vs `now()` em horas, com mensagem orientando CC-e/devolução fora do prazo |
| Justificativa de cancelamento ≥ 15 chars | Validator Zod + reforço no use case |

### Workers e jobs em background (EP-07b)

A reconciliação de NFe em PROCESSING é feita por um processo dedicado de workers BullMQ,
separado do servidor HTTP:

```powershell
# Terminal 1 — API HTTP
npm run dev

# Terminal 2 — Workers (mesmo container em produção via `command: ["npm","run","start:worker"]`)
npm run worker
```

O processo `worker` (em [src/shared/infra/queues/worker.ts](src/shared/infra/queues/worker.ts)):

1. Conecta um Redis dedicado para os Workers BullMQ.
2. Sobe o `NFeReconciliationWorker`.
3. Agenda um job repeatable a cada **2 minutos** com `jobId: 'nfe-reconciliation-sweep'`
   (jobId fixo evita acúmulo de duplicatas em restarts).
4. Cada execução lista NFe em PROCESSING há ≥ 1 minuto (via `listStaleProcessing`),
   resolve o certificado A1 da empresa via `IntegrationCredentialResolver` e chama
   `ReconcileNFeUseCase.execute()` para cada uma.
5. cStat 100 → AUTHORIZED (com protocolo); cStat 105/217 → mantém PROCESSING para próxima
   varredura; cStat 110/205/301/302 → DENIED; demais → REJECTED. Cada transição gera
   AuditLog + Notification.

A partir do EP-06b, o resolver definitivo é `TypeOrmIntegrationCredentialResolver` —
consulta a entidade `Certificate` em tempo real. Para cada empresa, busca o certificado
ativo (não revogado, dentro da janela de validade) com `valid_to` mais distante. Quando
o operador faz renovação cadastrando um novo PFX antes do antigo expirar, o motor já
usa o novo automaticamente.

## Custódia de certificados A1 (EP-06b)

### Upload

`POST /certificates` recebe `{ pfxBase64, password, alias? }`. O `UploadCertificateUseCase`:

1. Decodifica base64 → Buffer.
2. `CertificateInspector` extrai metadados (subject, CN, CNPJ titular extraído via regex
   do CN ICP-Brasil `NOME:CNPJ`, serial, thumbprint SHA-1, validade).
3. Confronta `cnpjTitular` com `Company.cnpj` — rejeita upload cruzado.
4. Recusa expirado, ainda não válido ou thumbprint já cadastrado (mesmo cert em outra
   empresa).
5. Persiste no cofre via `ICertificateVault.store` — recebe `vaultRef` opaco.
6. Persiste registro em `certificates` (sem o conteúdo bruto).
7. `AuditService` registra. `NotificationService` avisa se já expira em ≤ 60 dias.

O `vaultRef` **nunca volta na resposta HTTP** — só vai para o banco onde os use cases
de emissão (EP-07) buscam via `Certificate.vaultRef`. A separação garante que vazamento
da resposta HTTP não comprometa o cofre.

### Alerta de expiração

Worker [`CertificateExpiryWorker`](src/modules/Certificates/infra/queues/CertificateExpiryWorker.ts)
roda diariamente às **08:00 UTC** (cron pattern `0 8 * * *`, jobId fixo evita duplicatas).
Chama `NotifyExpiringCertificatesUseCase` que varre `listExpiring(60)` e cria notificações
em três faixas:

| Dias restantes | Severity | Categoria |
| --- | --- | --- |
| ≤ 7 | `error` | `certificate.expiring.urgent` |
| 8 – 30 | `warn` | `certificate.expiring.soon` |
| 31 – 60 | `info` | `certificate.expiring.heads-up` |

### Revogação

`DELETE /certificates/:id` — operação irreversível. Marca `active = false` + `revoked_at`
no banco e tenta remover o conteúdo do cofre. Se o cofre estiver indisponível, o banco
permanece revogado (cofre vira limpeza assíncrona). Exige permissão `vault.write` ou
`admin.full`.

### Pendências reconhecidas (registradas para fases seguintes)

| Pendência | Quando entra | Risco se ignorada |
| --- | --- | --- |
| **Validação contra XSD oficial** | EP-07 / Fase 1c | Rejeições por estrutura inválida pegam só na SEFAZ (custa I/O). |
| **Certificado A3 (HSM/token físico)** | v2 do produto | Limita atendimento a empresas que usam token físico. |
| **Worker de monitoramento de saúde por UF** | EP-06b | Decisão manual de entrar em contingência atrasa resposta. |
| **Tabela completa de endpoints (27 UFs)** | EP-06b | Empresas em UFs não mapeadas (CE, GO, PR, RJ, RN, RO etc. fora dos 5 atuais) falham. |
| **Bull Board para visualizar filas** | EP-09 (frontend admin) | Apenas atrapalha diagnóstico — não afeta operação. |

Consulte `docs/Plano_Desenvolvimento_Sistema_Fiscal_v1.0.md` para o backlog completo.

## Notas de segurança

- `JWT_SECRET` precisa de ≥ 16 chars; em produção, **use cofre de segredos** (não `.env`).
- Bcrypt cost configurável via env (`BCRYPT_COST`, padrão 12).
- Após `LOGIN_MAX_ATTEMPTS` (padrão 5) tentativas falhas, a conta fica bloqueada por
  `LOGIN_LOCK_DURATION_MINUTES` (padrão 15 min).
- Refresh tokens são **opacos** (não JWT); só o hash SHA-256 é persistido. Cada uso
  revoga o token anterior e emite outro (rotação).
- Logs Pino redaem automaticamente campos sensíveis (`authorization`, `password`, etc.).

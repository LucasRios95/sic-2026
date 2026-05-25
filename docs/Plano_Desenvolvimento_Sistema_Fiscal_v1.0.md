# Plano de Desenvolvimento — Sistema Fiscal-Financeiro
## Épicos, Tarefas, Critérios de Aceitação e Estimativas — Fases 0 a 4

> Versão 1.0 — 22 de maio de 2026.
> Stack: Node.js LTS · TypeScript · Express 5 · TypeORM · PostgreSQL · React 19 · tsyringe
> Arquitetura: Clean Architecture + SOLID + DI


| Atributo | Valor |
| --- | --- |
| Documento | Plano de Desenvolvimento (derivado do PRD v1.3, schema TypeORM e fluxogramas UX) |
| Versão | 1.0 |
| Data | 22 de maio de 2026 |
| Status | Para revisão de Engenharia, Produto e Patrocinador |
| Classificação | Interno — Confidencial |
| Público-alvo | Tech Lead, Engenharia, Produto, QA, Patrocinador |
| Stack alvo | Node.js LTS · TypeScript · Express 5 · TypeORM · PostgreSQL · React 19 · tsyringe |
| Modelo arquitetural | Clean Architecture + SOLID + Injeção de Dependência (tsyringe) |


**Como ler este documento: ** *o trabalho está organizado em fases (alinhadas ao roadmap do PRD), épicos (agrupamentos de valor) e tarefas (unidades executáveis). Cada tarefa tem ID estável, descrição, checklist técnico, critérios de aceitação verificáveis e estimativa em pontos de Fibonacci (1, 2, 3, 5, 8, 13). Tarefas marcadas como bloqueantes (B) impedem outras de iniciar; estimativas acima de 8 pontos devem ser quebradas no refinamento.*


# Sumário


*Ao abrir no Microsoft Word, clique com o botão direito sobre o sumário abaixo e selecione “Atualizar campo” (ou F9) para gerar automaticamente a lista de seções.*


## 1. Visão Geral do Plano


### 1.1 Premissas

- Equipe inicial sugerida: 1 Tech Lead, 2 a 3 Backend Sêniores (com 1 com experiência fiscal), 1 a 2 Frontend Sêniores, 1 DevOps/SRE, 1 QA Sênior, 1 Especialista Fiscal/Contábil (parcial, validação).
- Sprints quinzenais (10 dias úteis); velocidade estimada inicial de 35 a 45 pontos por sprint do time backend e 25 a 35 do frontend, calibrada após a Sprint 2.
- Fase 0 e Fase 1 (MVP) entregues dentro do ano-teste de 2026 — esse é o gatilho não-negociável do cronograma.
- Fases 2 a 4 têm escopo detalhado mas estimativas referenciais; serão re-planejadas a cada início de fase com base em aprendizados.

### 1.2 Stack tecnológica consolidada


| Camada | Tecnologia | Justificativa de escolha |
| --- | --- | --- |
| Runtime | Node.js LTS (22.x) | Maturidade, ecossistema, performance adequada a APIs fiscais; LTS garante 30 meses de suporte. |
| Linguagem | TypeScript 5.x (strict) | Type-safety essencial para tributação; refactoring seguro em base de código grande. |
| API | Express 5.x | Estável, amplamente conhecido, integra com tsyringe e padrões de middleware bem documentados. |
| ORM | TypeORM 0.3+ | Entidades com decorators encaixam naturalmente em Clean Architecture; migrations versionadas; suporte robusto a Postgres. |
| Banco de dados | PostgreSQL 16+ | ACID, Decimal nativo de precisão arbitrária, JSON, particionamento — todos críticos para uso fiscal. |
| Injeção de dependência | tsyringe | DI leve, decorator-based, integra com TypeORM via custom providers. |
| Frontend | React 19 | Server Components, melhor DX, ecossistema maduro; equipe com experiência. |
| Build / Bundle | Vite (frontend) · tsc + tsx (backend) | Velocidade de feedback no dev, build determinístico em produção. |
| Validação | Zod | Type-safe end-to-end; mesma lib no front e no back. |
| Testes | Vitest (unit) · Supertest (HTTP) · Playwright (E2E) | Stack consistente, rápida, com cobertura por camada. |
| Filas e jobs | BullMQ + Redis | Processamento assíncrono de emissão, distribuição DF-e, webhooks — requisito do PRD (INT-04, ENT-02). |
| Observabilidade | OpenTelemetry + Grafana stack (Loki, Tempo, Prometheus) | Logs estruturados, métricas, tracing — padrão aberto, sem vendor lock-in. |
| XML (entrada/saída fiscal) | fast-xml-parser (parsing) · xmlbuilder2 (composição) | Performance e correção; suportam canonicalização C14N necessária para assinatura XML-DSig. |
| Assinatura XML-DSig | xml-crypto | Lib estabelecida para assinatura de NF-e em Node; requer cuidados de canonicalização documentados nas tarefas. |
| PDF (DANFE/relatórios) | @react-pdf/renderer (DANFE) · pdfkit (relatórios) | React-PDF para layouts complexos com componentização; PDFKit para relatórios programáticos. |
| Cofre de segredos | HashiCorp Vault (preferencial) ou AWS Secrets Manager | Custódia de certificados A1/A3 e tokens — requisito de segurança (SEF-03/04, RNF-10). |
| CI/CD | GitHub Actions + Docker + Terraform | Pipeline reproduzível; infraestrutura como código. |
| Container/Deploy | Docker + Kubernetes (ou ECS como alternativa) | Escalabilidade horizontal de workers; ambientes segregados. |


### 1.3 Princípios arquiteturais aplicados


Clean Architecture com quatro camadas, isolamento estrito de dependências (a camada interna não conhece a externa), e tsyringe para resolução de dependências em runtime:


| Camada | Responsabilidade | Exemplos no projeto |
| --- | --- | --- |
| Domain | Entidades de negócio, regras puras, interfaces de repositório. Sem nenhuma dependência externa. | NFe (agregado), MotorTributario (serviço de domínio), INFeRepository (porta). |
| Application | Use cases que orquestram o domínio. Recebem entrada validada, produzem saída. | EmitirNFeUseCase, ImportarXmlEntradaUseCase, FecharMesUseCase. |
| Infrastructure | Implementações concretas: TypeORM, integração SEFAZ/Focus, filas, cofre, e-mail. | TypeOrmNFeRepository, SefazSoapClient, FocusNfeHttpClient. |
| Presentation | Express controllers, middlewares, validação Zod, mapeamento HTTP. | NFeController, requireAuth(), tenantContext(). |


Regras SOLID aplicadas:

- SRP — cada use case tem uma responsabilidade única e nome no infinitivo (EmitirNFe, CancelarNFe, ManifestarDestinatario).
- OCP — motor tributário extensível por estratégia (CalculadoraIcmsProprio, CalculadoraDifal, CalculadoraIbsCbs); adicionar tributo novo é nova classe, não edição de existente.
- LSP — repositórios derivados respeitam o contrato da interface base; mocks em testes são intercambiáveis.
- ISP — interfaces pequenas e específicas (INFeReader, INFeWriter separados) em vez de uma INFeRepository monolítica.
- DIP — domain depende de abstrações (ICertificateVault), não de Vault concreto; tsyringe resolve em runtime.

### 1.4 Estrutura de pastas alvo


Backend (monorepo opcional, mas raiz dedicada para o backend):


`src/
``  domain/
``    entities/                   — entidades puras (NFe, NFeItem, Cliente, …)
``    value-objects/              — CNPJ, ChaveAcesso, Decimal monetário
``    repositories/               — interfaces (INFeRepository, …)
``    services/                   — serviços de domínio (MotorTributario)
``    errors/                     — erros de domínio tipados
``  application/
``    use-cases/                  — um arquivo por use case
``    dtos/                       — DTOs de entrada/saída dos use cases
``    ports/                      — interfaces de adaptadores externos
``  infrastructure/
``    database/typeorm/           — entidades TypeORM, migrations, repositórios
``    sefaz/                      — cliente SOAP SEFAZ, assinatura, contingência
``    focus-nfe/                  — cliente REST Focus, webhook receiver
``    queues/                     — BullMQ workers e producers
``    vault/                      — adapter de cofre de segredos
``    pdf/                        — gerador de DANFE/DANFSe/relatórios
``    xml/                        — parser e composer de XML fiscal
``    container/                  — registro de DI (tsyringe)
``  presentation/
``    http/
``      controllers/              — controllers Express
``      middlewares/              — auth, tenant context, error handler
``      routes/                   — definição de rotas
``      validators/               — schemas Zod
``  shared/                       — utils, tipos compartilhados, constants
``  index.ts                      — bootstrap da aplicação
``tests/                          — unit, integration, e2e
`


### 1.5 Governança e Definition of Done


Definition of Done (aplica-se a TODA tarefa antes de ser marcada concluída):

1. Código revisado por outro engenheiro (PR aprovado com pelo menos 1 reviewer).
1. Testes unitários cobrindo o caminho feliz e os principais desvios; cobertura mínima de 80% nos arquivos novos.
1. Testes de integração nas tarefas marcadas com (I); E2E nas marcadas com (E2E).
1. Lint, formatação e type-check passando no CI sem warnings novos.
1. Documentação técnica atualizada quando aplicável (README, ADR, swagger/OpenAPI).
1. Critérios de aceitação verificáveis pelo QA — sem 'funciona na minha máquina'.
1. Quando envolve fiscal: validação do especialista fiscal/contábil antes do merge.
1. Logs estruturados, métricas e tracing onde a operação cruza limites de processo (DB, HTTP, fila).
1. Variáveis sensíveis NUNCA hard-coded; usar cofre de segredos.
1. Migration TypeORM gerada e revisada; rollback testado em ambiente de homologação.

### 1.6 Convenções de identificação


**Épicos: **EP-XX (ex.: EP-01 Fundação Backend).


**Tarefas: **TSK-XXX (numeração sequencial, estável, não reordenada).


**Estimativas: **Fibonacci truncado (1, 2, 3, 5, 8, 13). Acima de 8, quebrar no refinamento.


**Marcadores: **(B) bloqueante para outras tarefas · (I) requer testes de integração · (E2E) requer teste end-to-end · (F) tarefa fiscal/contábil sensível, exige validação de especialista.


### 1.7 Resumo executivo de esforço


Estimativas-síntese por fase. Pontos brutos; ainda não considera férias, dependências externas (SEFAZ, Focus) ou refinamento. Use como ordem de grandeza, não como contrato.


| Fase | Foco | Pontos estimados | Sprints aprox. | Bloco de execução |
| --- | --- | --- | --- | --- |
| Fase 0 | Fundamentos: arquitetura, DI, RBAC, multiempresa, cadastros base, motor tributário | 180–220 | 5 a 7 | 2026 — 1º trimestre |
| Fase 1a | Núcleo SEFAZ: NF-e modelo 55 emitida direto, assinatura, contingência, certificado | 240–290 | 7 a 9 | 2026 — 2º trimestre |
| Fase 1b | Recepção SEFAZ + NFS-e Focus + manifestação | 150–180 | 4 a 6 | 2026 — 3º trimestre |
| Fase 1c | MVP completo: relatórios fiscais, apuração assistida, ano-teste 2026 | 110–140 | 3 a 5 | 2026 — 4º trimestre |
| Fase 2 | Comercial e Financeiro: vendas, compras, AR/AP, fluxo de caixa, ECONF | 200–250 | 6 a 8 | 2027 |
| Fase 3 | Migração do legado: ETL, operação paralela, corte | 120–160 | 4 a 5 | 2027 |
| Fase 4 | Conformidade 2027+: CBS plena, IS, split payment, ampliação a Simples/MEI | 180–220 (ano) | Recorrente | 2027–2033 |
| TOTAL MVP (Fases 0+1a+1b+1c) | — | 680–830 | 19 a 27 | 2026 |


### 1.8 Riscos transversais ao plano


| Risco | Mitigação no plano |
| --- | --- |
| Equipe sem experiência prévia em assinatura XML-DSig e canonicalização C14N | Tarefas TSK-100 e TSK-101 dedicadas, com revisão de especialista fiscal. Considerar treinamento ou consultoria pontual no início da Fase 1a. |
| Mudanças de Notas Técnicas durante o desenvolvimento | Motor tributário versionado por vigência (TSK-074 a TSK-082); processo formal de atualização (TSK-310). |
| Indisponibilidade prolongada de SEFAZ em homologação | Contingência EPEC/SVC implementada cedo (TSK-115); fixtures de XML para testes offline. |
| Escopo da Reforma sofrer mudanças regulatórias significativas | Tarefas de conformidade isoladas em épicos próprios (EP-23 e EP-27); cláusula contratual de re-planejamento por evento regulatório. |
| Migração do legado Paradox revelar inconsistências de dados não previstas | Fase 3 reserva 30% do orçamento para saneamento; rollback testado. |
| Saída de pessoas-chave (especialmente fiscal sênior) | Documentação obrigatória em ADRs; pair programming nas tarefas marcadas (F); base de conhecimento de rejeições. |


## 2. Fase 0 — Fundamentos


Estabelece a base técnica do produto: arquitetura, infraestrutura, autenticação, multiempresa, cadastros e motor tributário parametrizável. Sem essa base, nenhum módulo fiscal pode ser construído. É a fase de maior risco arquitetural — decisões aqui ecoam por todas as outras.


**Critério de saída da fase: **é possível autenticar um usuário, criar uma empresa com flags tributárias, cadastrar produto/cliente/serviço, e o motor tributário consegue calcular tributos para uma operação simples (intraestadual, sem ST, sem DIFAL). Não há emissão fiscal real ainda — isso é Fase 1a.


## EP-01 — Fundação Backend e Arquitetura


**Resumo. **Inicialização do projeto Node/TypeScript com Clean Architecture, tsyringe, TypeORM e infraestrutura de qualidade.


*Conteúdo: 10 tarefas · Total: 25 pontos*


#### TSK-001  ·  2 pts · B   Inicializar projeto backend

**Descrição.** Criar projeto Node.js + TypeScript com configuração strict, scripts padrão e estrutura mínima de pastas conforme Clean Architecture definida em 1.4.
**Checklist técnico.** 
- npm init + tsconfig.json com strict, noImplicitAny, exactOptionalPropertyTypes
- Instalar express@5, reflect-metadata, tsyringe, typeorm, pg, zod
- Instalar devDeps: typescript, tsx, vitest, eslint, prettier, @types/*
- Configurar scripts: dev, build, start, test, lint, format, type-check
- Criar estrutura de pastas: domain, application, infrastructure, presentation, shared
- Criar .editorconfig, .nvmrc (Node LTS), .gitignore, README inicial
**Critérios de aceitação.** 
1. npm run dev sobe servidor Express respondendo /health com 200 OK
2. npm run type-check passa sem erros
3. npm run lint passa sem warnings
4. Estrutura de pastas reflete exatamente a Seção 1.4 do plano


#### TSK-002  ·  3 pts · B   Configurar tsyringe e container de DI raiz

**Descrição.** Habilitar reflect-metadata, criar container central, definir tokens de injeção e padrão de registro de dependências.
**Checklist técnico.** 
- Importar reflect-metadata como primeiro import em index.ts
- Criar src/infrastructure/container/index.ts com função registerDependencies()
- Definir tokens via Symbol nomeado em src/shared/tokens.ts
- Implementar decorator @injectable() exemplo em uma classe stub
- Documentar padrão de registro: interface no domain, classe em infrastructure
- ADR-001: 'Por que tsyringe e como registramos dependências'
**Critérios de aceitação.** 
1. Container resolve uma classe de exemplo (StubService) via container.resolve
2. Teste unitário valida resolução por token
3. ADR-001 commitada em docs/adr/
**Dependências.** TSK-001


#### TSK-003  ·  3 pts · B I   Configurar TypeORM e DataSource

**Descrição.** Inicializar TypeORM com DataSource configurado por env, suporte a migrations e integração com tsyringe via custom provider.
**Checklist técnico.** 
- Criar src/infrastructure/database/typeorm/data-source.ts com configuração baseada em env
- Configurar migrationsTableName, entities glob, migrations glob
- Scripts npm: typeorm:migration:generate, :run, :revert, :show
- Provider tsyringe para DataSource (singleton, inicializado no bootstrap)
- Connection pool configurado (min 2, max 10 — ajustável por env)
- ADR-002: 'TypeORM + Clean Architecture: padrão Repository'
**Critérios de aceitação.** 
1. Aplicação conecta no Postgres local via docker-compose
2. npm run typeorm:migration:show retorna sem erro
3. Teste de integração: criar tabela via migration, ler com DataSource, dropar
**Dependências.** TSK-002


#### TSK-004  ·  3 pts   Padronizar tratamento de erros e response envelope

**Descrição.** Criar hierarquia de erros de domínio, middleware Express global e envelope de resposta consistente.
**Checklist técnico.** 
- Classe base DomainError com code (string), statusCode, message, details opcional
- Subclasses: NotFoundError, ValidationError, BusinessRuleError, IntegrationError, AuthError
- Middleware errorHandler em presentation/http/middlewares mapeando para HTTP
- Envelope JSON: { data | error: { code, message, details? }, requestId }
- Erros não mapeados retornam 500 com requestId logado (sem stack ao cliente em prod)
- Sentry/equivalente plugado opcionalmente via env
**Critérios de aceitação.** 
1. Lançar NotFoundError em rota de teste retorna 404 com envelope correto
2. Lançar Error genérico retorna 500 com requestId; stack só aparece em NODE_ENV=development
3. Testes unitários cobrem o mapeamento de cada classe de erro
**Dependências.** TSK-001


#### TSK-005  ·  2 pts   Configurar logger estruturado e correlação por requestId

**Descrição.** Logger Pino estruturado com requestId propagado por AsyncLocalStorage e middleware Express.
**Checklist técnico.** 
- Instalar pino e pino-pretty (dev)
- Criar Logger interface no domain; implementação PinoLogger em infrastructure
- Middleware requestId gera UUID v7 por requisição e armazena em AsyncLocalStorage
- Helper getRequestId() acessível em qualquer camada
- Logs sempre incluem requestId, userId (se autenticado), tenantId, companyId
**Critérios de aceitação.** 
1. Requisição HTTP gera log com requestId; chamada interna no mesmo request reusa o mesmo ID
2. Logger é injetável via tsyringe (token Symbol)
3. Logs em produção saem em JSON; em dev, formato legível
**Dependências.** TSK-002


#### TSK-006  ·  2 pts   Configurar validação com Zod e middleware de validação

**Descrição.** Padrão de validação Zod para inputs HTTP, com middleware genérico e conversão de erros para ValidationError.
**Checklist técnico.** 
- Helper validateRequest({ body, query, params }) retorna middleware
- Schemas Zod ficam em presentation/http/validators/ por recurso
- Erros Zod são convertidos em ValidationError com details estruturado
- Tipos de input dos controllers derivados via z.infer<typeof schema>
**Critérios de aceitação.** 
1. Rota de teste valida body, retorna 422 com lista de erros campo a campo se inválido
2. Type-check garante que o controller recebe tipos derivados do schema
**Dependências.** TSK-004


#### TSK-007  ·  2 pts · B   Configurar Vitest e estratégia de testes por camada

**Descrição.** Setup completo de testes unitários, integração e fixtures, com isolamento por camada.
**Checklist técnico.** 
- vitest.config.ts com paths aliases, coverage v8, threshold 80% para src/
- Separação: tests/unit, tests/integration, tests/e2e com setups distintos
- Helper buildContainer() para testes que precisam de DI customizado
- Banco de testes via testcontainers ou Postgres dedicado em CI
- Padrão de Test Data Builder em tests/builders/ para entidades de domínio
**Critérios de aceitação.** 
1. npm test executa unit + integration; coverage report gerado
2. Teste exemplo passa em cada camada (1 unit + 1 integration)
3. CI quebra build se cobertura < 80% nos arquivos modificados
**Dependências.** TSK-003


#### TSK-008  ·  2 pts   Configurar Docker Compose para desenvolvimento

**Descrição.** docker-compose.yml com Postgres, Redis e dependências locais necessárias.
**Checklist técnico.** 
- Postgres 16 com volume nomeado, healthcheck
- Redis 7 (para BullMQ na Fase 1)
- Adminer ou pgAdmin para inspeção (opcional)
- Script make/npm para reset completo do ambiente
- .env.example com todas as variáveis documentadas
**Critérios de aceitação.** 
1. docker-compose up sobe todos os serviços e a app conecta sem erro
2. Reset (down -v && up) deixa ambiente em estado limpo conhecido


#### TSK-009  ·  3 pts · B   Pipeline CI inicial (GitHub Actions)

**Descrição.** CI executa lint, type-check, build, testes e gera artefato Docker em cada PR e push para main.
**Checklist técnico.** 
- Job de checks (lint + type-check + test) com cache de node_modules
- Job de build da imagem Docker em paralelo
- Postgres e Redis como services no job de integration
- Coverage upload (Codecov ou equivalente)
- Status checks obrigatórios na branch protection do main
- Build de produção tagueado com SHA do commit
**Critérios de aceitação.** 
1. PR de exemplo dispara CI e todos os jobs passam
2. Tentar mergear com check falhando é bloqueado pela branch protection
**Dependências.** TSK-007, TSK-008


#### TSK-010  ·  3 pts · B   Bootstrap React 19 + Vite + estrutura inicial

**Descrição.** Frontend separado (apps/web) com React 19, Vite, TanStack Query, TanStack Router, shadcn/ui e padrão de feature folders.
**Checklist técnico.** 
- Vite + TypeScript strict + ESLint + Prettier alinhados ao backend
- TanStack Router com route tree gerada
- TanStack Query com QueryClient e devtools
- shadcn/ui inicializado com tokens de cor neutros (definir paleta na Fase 1)
- Estrutura: src/features/<feature>/{components,hooks,api,types}, src/shared
- Cliente HTTP fetch wrapper com tratamento de envelope de erro do backend
**Critérios de aceitação.** 
1. npm run dev no frontend abre app em localhost com rota / e /login renderizando
2. Erro mock do backend é capturado e exibido em toast
3. Type-check e lint passam


## EP-02 — Multiempresa, RBAC e Autenticação


**Resumo. **Tenant raiz, empresas, usuários, perfis, permissões granulares e middleware de contexto de empresa.


*Conteúdo: 7 tarefas · Total: 31 pontos*


#### TSK-020  ·  5 pts · B   Modelagem TypeORM: Tenant, Company, Branch

**Descrição.** Entidades TypeORM com decorators, migrations iniciais e repositórios.
**Checklist técnico.** 
- Entidade Tenant (id, name, slug, active, timestamps)
- Entidade Company com TODOS os campos do schema (CNPJ, IE, IM, CRT, endereço, flags fiscais — usaIcms, usaIcmsSt, usaIpi, usaDifal, usaFcp, usaIcmsDesonerado)
- Entidade Branch com FK para Company
- Migration inicial criando as tabelas com índices
- Repositórios ITenantRepository, ICompanyRepository, IBranchRepository (interfaces) + implementações TypeORM
- Registro em tsyringe
**Critérios de aceitação.** 
1. Migration up + down testada em homologação
2. Testes de integração: criar tenant → criar company → criar branch; listar companies por tenant
3. Constraint de unicidade CNPJ funciona; tentativa de duplicar retorna erro de negócio claro
**Dependências.** TSK-003


#### TSK-021  ·  5 pts · B   Modelagem TypeORM: User, Role, Permission, UserRole, RolePermission

**Descrição.** Entidades de RBAC com vínculo opcional por empresa (UserRole.companyId nullable).
**Checklist técnico.** 
- Entidade User (id, tenantId, email único, passwordHash, fullName, MFA fields, lockedUntil, failedLogins)
- Entidade Role com (tenantId, name, description, system flag)
- Entidade Permission global (code único, description)
- Tabela de junção UserRole com chave composta (userId, roleId, companyId nullable)
- Tabela RolePermission
- Seed inicial de perfis: Administrador, Gestor, Faturista, Fiscal/Contábil, Compras, Financeiro
- Seed inicial de permissões: nfe.emit, nfe.cancel, nfe.cc-e, ent.manifest, fin.payable.write, etc. (lista completa em ADR-003)
**Critérios de aceitação.** 
1. Migration aplicada; seed roda em ambiente novo sem erro
2. Testes: usuário pode ter papel global (companyId null) ou por empresa específica
3. Atribuir mesmo papel duas vezes no mesmo escopo é idempotente
**Dependências.** TSK-020


#### TSK-022  ·  5 pts · I   Use case e endpoint: criar e autenticar usuário

**Descrição.** Cadastro de usuário pelo admin e login com senha + bcrypt + retorno de token JWT.
**Checklist técnico.** 
- Use case CriarUsuarioUseCase com validação de email único no tenant
- Hash bcrypt com cost 12 (configurável)
- Use case AutenticarUseCase: valida credenciais, incrementa failedLogins em erro, bloqueia após 5 tentativas por 15min
- JWT com payload mínimo: userId, tenantId, accessibleCompanyIds, exp
- Refresh token opaco armazenado em tabela RefreshToken (TTL configurável)
- Endpoint POST /auth/login, POST /auth/refresh, POST /auth/logout
**Critérios de aceitação.** 
1. Login com credencial válida retorna access (15min) + refresh (7 dias)
2. 5 tentativas erradas bloqueiam por 15min; tentativa após bloqueio retorna 423
3. Refresh com token válido emite novo access; refresh com token expirado retorna 401
4. Logout revoga o refresh token (linha removida)
**Dependências.** TSK-021, TSK-004


#### TSK-023  ·  3 pts   Middleware de autenticação JWT + propagação no AsyncLocalStorage

**Descrição.** Middleware Express valida JWT, popula contexto da requisição com user, tenant e empresas acessíveis.
**Checklist técnico.** 
- Middleware requireAuth() valida assinatura, expiração, blacklist (se aplicável)
- Popula AsyncLocalStorage: { userId, tenantId, roles, accessibleCompanyIds }
- Helper currentUser() acessível em qualquer camada
- Decorator @requirePermission('nfe.emit') em controllers (ou middleware factory)
- Erro 401 quando ausente; 403 quando autenticado mas sem permissão
**Critérios de aceitação.** 
1. Rota protegida sem token retorna 401; com token de outro tenant retorna 403
2. currentUser() retorna o usuário correto dentro de um use case
3. Logger inclui userId automaticamente em todas as linhas de log dentro do request autenticado
**Dependências.** TSK-022, TSK-005


#### TSK-024  ·  3 pts · I   Middleware de contexto de empresa (tenantContext)

**Descrição.** Garante que toda operação transacional inclui companyId; bloqueia acesso a empresa fora do escopo do usuário.
**Checklist técnico.** 
- Header X-Company-Id ou query param ?companyId resolve a empresa-alvo
- Middleware valida que companyId ∈ accessibleCompanyIds do usuário
- Popula AsyncLocalStorage com companyId atual
- Repositórios TypeORM injetam companyId automaticamente em where (via helper baseQuery())
- Tarefa de auditoria: registrar tentativa de acesso a empresa não autorizada
**Critérios de aceitação.** 
1. Listar clientes sem companyId no contexto retorna 400 com mensagem clara
2. Tentar acessar empresa de outro usuário retorna 403 e gera log de segurança
3. Teste de integração: criar dado em empresa A não aparece em listagem de empresa B (mesmo tenant)
**Dependências.** TSK-023


#### TSK-025  ·  5 pts   MFA opcional (TOTP) e gestão de sessões

**Descrição.** Suporte a TOTP (Google Authenticator) com setup, validação e backup codes.
**Checklist técnico.** 
- Endpoint POST /auth/mfa/setup gera secret e QR code base64
- Endpoint POST /auth/mfa/verify valida token; ativa MFA no usuário
- Login com MFA ativo exige segundo fator antes de emitir JWT
- Geração de 10 backup codes single-use armazenados hashed
- Endpoint para regenerar backup codes (invalida os anteriores)
**Critérios de aceitação.** 
1. Usuário consegue habilitar e usar MFA fim a fim
2. Backup code usado uma vez não funciona novamente
3. Admin pode resetar MFA de outro usuário (com auditoria)
**Dependências.** TSK-022


#### TSK-026  ·  5 pts   Telas frontend: Login, MFA, seleção de empresa, troca de contexto

**Descrição.** Frontend dos fluxos de autenticação seguindo o mapa de jornada geral.
**Checklist técnico.** 
- Tela /login com email + senha + recuperação
- Tela /mfa/verify quando MFA ativo
- Tela /select-company quando usuário tem acesso a múltiplas empresas
- Seletor de empresa persistente no header com troca rápida
- Persistência segura do refresh token (httpOnly cookie via backend)
- Auto-logout após inatividade configurável
**Critérios de aceitação.** 
1. Fluxo Login → MFA → SelectCompany → Dashboard funciona ponta a ponta
2. Trocar empresa não força novo login mas atualiza contexto e re-fetch das queries TanStack
3. Refresh token rotaciona automaticamente próximo ao vencimento do access
**Dependências.** TSK-024, TSK-010


## EP-03 — Cadastros Base — Clientes, Fornecedores, Produtos e Serviços


**Resumo. **Cadastros fundamentais com todos os atributos fiscais detalhados na Seção 6.1.1 do PRD.


*Conteúdo: 7 tarefas · Total: 39 pontos*


#### TSK-040  ·  5 pts · F   Modelagem TypeORM: Customer com atributos fiscais completos

**Descrição.** Entidade Customer espelhando o schema Prisma, incluindo crtDestinatario, consumidorFinal, indicadorPresenca, SUFRAMA, suporte a exterior.
**Checklist técnico.** 
- Todos os campos da v1.3 do schema (tipoPessoa, cnpjCpf, indicadorIE, crtDestinatario, consumidorFinal, indicadorPresenca, endereço completo, suframa, pais)
- Value Objects: CnpjCpf (com validação), CodigoMunicipioIbge
- Validações: CNPJ válido (algoritmo), CPF válido, unicidade por (companyId, cnpjCpf)
- Soft delete via deletedAt
- Migration + repositório + testes
**Critérios de aceitação.** 
1. Criar cliente PJ válido funciona; CNPJ inválido retorna 422 com motivo
2. Tentar criar cliente com CNPJ duplicado na mesma empresa retorna erro de negócio
3. Cliente exterior (sem CNPJ, com codigoPais ≠ 1058) é aceito
**Dependências.** TSK-024


#### TSK-041  ·  3 pts · F   Modelagem TypeORM: Supplier

**Descrição.** Fornecedor com crtFornecedor (afeta apropriação de crédito).
**Checklist técnico.** 
- Mesma estrutura de Customer adaptada (sem consumidorFinal/indPres)
- Campo crtFornecedor para fornecedores PJ
- Indicação de produtor rural / contribuinte (afeta tratamento ICMS)
**Critérios de aceitação.** 
1. CRUD funciona; cobertura de testes adequada
**Dependências.** TSK-040


#### TSK-042  ·  8 pts · B F   Modelagem TypeORM: Product + ProductTaxRule (versionado)

**Descrição.** Produto e sua regra tributária versionada por vigência, com TODOS os campos discutidos: ICMS próprio, ICMS-ST, ICMS desonerado, FCP, IPI (inclusive por unidade), PIS/COFINS, IBS/CBS/IS.
**Checklist técnico.** 
- Entidade Product (códigos, NCM, CEST, origem, GTIN, controle de estoque, importado)
- Entidade ProductTaxRule com ~60 campos da v1.3 (ver schema)
- Validação: NCM 8 dígitos, CEST 7 dígitos, origem 0-8
- Repositório com método getRegraVigente(productId, data): busca regra onde validFrom ≤ data < validTo
- Constraint: períodos não podem se sobrepor para o mesmo produto
- Trigger ou validação na camada de aplicação para esse invariante
**Critérios de aceitação.** 
1. Criar produto + regra vigente funciona
2. Criar segunda regra com vigência sobreposta retorna erro de negócio claro
3. Buscar regra vigente em data X retorna a regra correta
4. Validação fiscal: especialista revisa os 60 campos contra o XML schema da NF-e
**Dependências.** TSK-024


#### TSK-043  ·  5 pts · F   Modelagem TypeORM: Service + ServiceTaxRule

**Descrição.** Serviço com tributação ISS (transição) e IBS/CBS (Reforma).
**Checklist técnico.** 
- Service: código, descrição, itemListaServico, cTribNac, cTribMun, CNAE
- ServiceTaxRule versionada: cstIss, aliqIss, tipoRetencao, cstIbsCbs, cClassTrib, cIndOp, retenções federais
- Validações por item da lista de serviços (LC 116/2003)
**Critérios de aceitação.** 
1. CRUD + busca por regra vigente; testes de unicidade e validação
**Dependências.** TSK-042


#### TSK-044  ·  5 pts   Use cases CRUD: Customer, Supplier, Product, Service

**Descrição.** Use cases padronizados (criar, atualizar, listar, buscar por id, soft delete) para cada cadastro.
**Checklist técnico.** 
- Padrão de DTOs por use case: Create*, Update*, *Output
- Listagem com paginação (cursor-based) e filtros básicos
- Validação: produto/serviço só pode ser desativado se não houver regra vigente futura
- Auditoria: todo CRUD gera AuditLog
**Critérios de aceitação.** 
1. Cobertura de testes ≥ 90% nos use cases
2. Listagem suporta filtro por texto, ativos/inativos, paginação
**Dependências.** TSK-040, TSK-041, TSK-042, TSK-043


#### TSK-045  ·  8 pts · E2E   Endpoints REST e telas frontend de cadastros

**Descrição.** API completa + telas CRUD com formulários estruturados para os 4 cadastros.
**Checklist técnico.** 
- Rotas /customers, /suppliers, /products, /services com GET, POST, PUT, DELETE
- Telas frontend usando shadcn/ui: lista (tabela com filtros), formulário (tabs por seção)
- Tela de Product especialmente: tabs Identificação, Tributação por vigência (com versionamento UX claro)
- Validação inline com Zod (mesmo schema do backend)
- E2E Playwright: criar produto com regra tributária, editar, listar, desativar
**Critérios de aceitação.** 
1. Faturista consegue cadastrar produto completo em menos de 2 minutos (UX validada)
2. Mudanças tributárias por vigência são intuitivas (mostrar histórico)
3. E2E passa no CI
**Dependências.** TSK-044, TSK-026


#### TSK-046  ·  5 pts   Importação de cadastros via CSV/XLSX (legado e onboarding)

**Descrição.** Importador genérico para popular cadastros em massa, com validação e relatório de inconsistências.
**Checklist técnico.** 
- Usar exceljs ou sheetjs para parsing
- Template de planilha por cadastro (download na UI)
- Validação linha a linha com relatório de erros (linha, coluna, motivo)
- Processamento em fila (BullMQ) para arquivos grandes (>1000 linhas)
- Idempotência por chave natural (CNPJ para cliente, código para produto)
**Critérios de aceitação.** 
1. Importar 500 produtos de planilha funciona em < 30s
2. Linhas com erro são reportadas; linhas válidas são importadas
3. Re-importar o mesmo arquivo atualiza (não duplica)
**Dependências.** TSK-045


## EP-04 — Tabelas Globais Fiscais e Motor Tributário


**Resumo. **Tabelas oficiais (InterstateAliquot, IcmsInternaUf, IcmsStMva, BeneficioFiscalUf), TaxParameter versionado e o motor tributário que consome tudo isso.


*Conteúdo: 13 tarefas · Total: 82 pontos*


#### TSK-060  ·  5 pts · B F   Modelagem das tabelas globais fiscais

**Descrição.** InterstateAliquot, IcmsInternaUf, IcmsStMva, BeneficioFiscalUf — todas versionadas por vigência.
**Checklist técnico.** 
- 4 entidades TypeORM com campos da v1.3 do schema
- Constraints de unicidade por chaves naturais + validFrom
- Repositórios com busca por par UF/UF/NCM/data conforme caso
- Seed inicial com valores oficiais 2026: alíquotas interestaduais Senado 22/89 e 13/2012, alíquotas internas atuais por UF, FCP por UF que adota
**Critérios de aceitação.** 
1. Seed roda em < 5s
2. Buscar alíquota interestadual SP→AM em 2026 retorna 7%
3. Buscar alíquota interna SP retorna 18% (ou valor vigente)
**Dependências.** TSK-003


#### TSK-061  ·  5 pts   Modelagem TaxParameter e TaxRule (genéricos)

**Descrição.** Tabelas parametrizáveis por chave/JSON para extensão sem mudança de schema.
**Checklist técnico.** 
- TaxParameter: companyId opcional, chave, valor JSON, fonteNorma, vigência
- TaxRule: companyId, condições JSON, cálculos JSON, prioridade, vigência
- Validação de chave: namespace.parametro (ex.: ibs.aliquota.padrao)
- ADR-004: 'Tributação como dados, não código'
**Critérios de aceitação.** 
1. Criar parâmetro com vigência futura funciona
2. Sobreposição de vigências para mesma chave/company gera erro
**Dependências.** TSK-060


#### TSK-062  ·  5 pts · B F   Motor tributário: arquitetura base e interfaces

**Descrição.** Definir as abstrações: ICalculadoraTributo, ContextoCalculo, ResultadoCalculo, Pipeline de calculadoras.
**Checklist técnico.** 
- Interface ICalculadoraTributo { aplica(ctx): boolean; calcular(ctx): ResultadoParcial }
- ContextoCalculo: produto/serviço, regra vigente, cliente, empresa (com flags), operação, UFs origem/destino, data
- MotorTributarioService orquestra: lista calculadoras, executa as aplicáveis, agrega resultado
- ADR-005: 'Motor tributário como pipeline de estratégias'
**Critérios de aceitação.** 
1. Testes de arquitetura: nova calculadora se registra via tsyringe @injectAll
2. Mock de calculadora consegue ser injetado em testes
**Dependências.** TSK-061, TSK-042


#### TSK-063  ·  8 pts · F I   Calculadora: ICMS próprio (com redução de base e desonerado)

**Descrição.** Cálculo de ICMS para operações internas e interestaduais, com tratamento de pRedBC, modBC e desoneração.
**Checklist técnico.** 
- Resolver alíquota: intraestadual usa regra do produto; interestadual busca InterstateAliquot
- Aplicar redução de base quando pRedBC > 0
- Tratar produto importado: força 4% se interestadual
- ICMS desonerado: calcular vICMSDeson conforme motivo
- Testes parametrizados com casos de cada UF
**Critérios de aceitação.** 
1. SP intraestadual, produto sem redução: ICMS = base × 18%
2. SP → AM, mesmo produto: ICMS = base × 7%
3. Produto importado SP → MG: ICMS = base × 4%
4. Caso com pRedBC = 33,33%: base reduzida a 66,67% antes de aplicar alíquota
**Dependências.** TSK-062


#### TSK-064  ·  13 pts · F I   Calculadora: ICMS-ST (com MVA original e ajustada)

**Descrição.** Calcula ST conforme cenários (remetente, retido anteriormente), busca MVA por par UF/NCM, aplica Convênio 35/2011 para MVA ajustada.
**Checklist técnico.** 
- Buscar regra de MVA em IcmsStMva por (ufOrigem, ufDestino, ncm); fallback para pMVAST do produto
- Cálculo de MVA ajustada: MVA_ajustada = [(1 + MVA_orig) × (1 - aliq_inter) / (1 - aliq_interna_dest)] - 1
- Base ST = (vProd + IPI + frete + seguro + outras) × (1 + MVA)
- ICMS-ST = (BaseST × aliqInternaDestino) - ICMS próprio
- Tratar ST retido anteriormente (cenário operação subsequente)
- Testes exaustivos com pelo menos 10 cenários reais (autopeças SP→MG, bebidas RJ→SP, cosméticos PR→RS, etc.)
**Critérios de aceitação.** 
1. Especialista fiscal valida 10 cálculos contra exemplos oficiais
2. Quando flag usaIcmsSt = false na empresa, calculadora não é aplicada (retorna early)
3. Casos sem MVA cadastrada retornam erro de configuração compreensível
**Dependências.** TSK-063


#### TSK-065  ·  8 pts · F I   Calculadora: DIFAL e FCP destino

**Descrição.** Diferencial de Alíquotas em operações interestaduais B2C, com FCP destino quando aplicável.
**Checklist técnico.** 
- Detecta aplicabilidade: ufOrigem ≠ ufDestino + consumidorFinal = true + empresa usa DIFAL
- baseICMSUFDest = valorOperação (com tratamentos específicos por UF)
- pICMSUFDest = alíquota interna do destino (IcmsInternaUf)
- pICMSInter = alíquota interestadual (InterstateAliquot)
- valorICMSUFDest = base × (pICMSUFDest - pICMSInter)
- FCP destino: base × pFCPUFDest quando UF de destino tem FCP
- Preencher grupo completo ICMSUFDest do item
**Critérios de aceitação.** 
1. Venda SP → AM, B2C, mercadoria 100 reais: DIFAL = 100 × (18% - 7%) = 11 reais
2. Quando destinatário é contribuinte: DIFAL não calculado (entra na apuração dele)
3. Quando empresa não usa DIFAL: calculadora não aplica
**Dependências.** TSK-063


#### TSK-066  ·  5 pts · F   Calculadora: IPI (com IPI por unidade)

**Descrição.** Cálculo de IPI percentual ou por valor unitário (cigarros, bebidas).
**Checklist técnico.** 
- Modo padrão: valorIpi = base × aliqIpi
- Modo por unidade: valorIpi = quantidade × vUnidIpi
- Tratar IPI suspenso, isento, não tributado (CSTs específicos)
- Quando empresa não tem usaIpi = true, calculadora não aplica
**Critérios de aceitação.** 
1. Indústria: IPI calculado corretamente para os 3 modos
2. Empresa sem IPI: vIPI = 0 e campo omitido no resultado
**Dependências.** TSK-063


#### TSK-067  ·  5 pts · F   Calculadora: PIS e COFINS (regime antigo)

**Descrição.** PIS/COFINS percentual ou por unidade, com tratamento de monofásico e ST.
**Checklist técnico.** 
- Modo padrão: base × alíquota (0,65/3 não-cumulativo; 1,65/7,6 cumulativo)
- Modo por unidade (combustíveis): qtde × vUnid
- CST específicos para monofásico, suspenso, isento
- Vigência: ativo até 2026; em 2027 não calcular mais (lê TaxParameter)
**Critérios de aceitação.** 
1. Vigência 2026: PIS+COFINS calculados
2. Vigência ≥ 2027: skipado com mensagem 'extinto pela Reforma'
**Dependências.** TSK-063


#### TSK-068  ·  8 pts · F I   Calculadora: IBS / CBS (Reforma)

**Descrição.** Cálculo dos novos tributos da Reforma, com modo ano-teste (2026) e modo operação plena.
**Checklist técnico.** 
- Resolver alíquota: produto sobrescreve UF; UF é padrão
- Modo ano-teste (2026): aplicar alíquotas simbólicas (CBS 0,9%; IBS 0,1%); marcar sem recolhimento
- Modo pleno: alíquotas reais da vigência
- Princípio do destino: usar UF de destino para IBS
- Tratar reduções, isenções, imunidades por CST IBS/CBS
- Preencher CST + cClassTrib obrigatoriamente
**Critérios de aceitação.** 
1. Validação fiscal contra exemplos do Informe Técnico RT 2025.002
2. Modo ano-teste claramente marcado no resultado (campo somenteRegistro = true)
**Dependências.** TSK-063


#### TSK-069  ·  5 pts · F   Calculadora: Imposto Seletivo (IS)

**Descrição.** IS sobre bens prejudiciais à saúde/ambiente — incidência a partir de 2027.
**Checklist técnico.** 
- Só aplica se produto tem incidenciaIs = true
- Vigência: a partir de 2027
- Alíquota do produto (aliqIs) ou padrão por NCM
**Critérios de aceitação.** 
1. Cenários cobertos: bebida alcoólica, cigarro, veículo poluente
**Dependências.** TSK-068


#### TSK-070  ·  5 pts · F   Calculadora de ISS (NFS-e) e retenções federais

**Descrição.** Para serviços: ISS por município, retenção quando aplicável, PIS/COFINS/CSLL retidos.
**Checklist técnico.** 
- Alíquota ISS: ServiceTaxRule + sobrescrita por município (TaxParameter)
- Quando tipoRetencao = RETIDO_TOMADOR: marca issRetido e calcula valor
- Retenções federais: PIS 0,65%, COFINS 3%, CSLL 1% quando aplicável (valor mínimo por nota)
- INSS 11% para serviços de cessão de mão de obra (item 17.05, etc.)
- IR retido conforme tabela
**Critérios de aceitação.** 
1. Especialista valida cenários de serviços prestados a PJ, com e sem retenção
2. Retenções aparecem agrupadas corretamente
**Dependências.** TSK-068


#### TSK-071  ·  5 pts · I   Pipeline orquestrador do motor tributário

**Descrição.** Junta todas as calculadoras no MotorTributarioService.calcular(itens, contexto).
**Checklist técnico.** 
- Resolve regra vigente do produto/serviço por data
- Itera calculadoras na ordem correta (ICMS antes de ST; ST antes de DIFAL; IBS independente)
- Agrega resultado em DTO ResultadoTributacaoItem (todos os campos do NFeItem)
- Soma totais por documento (DTO ResultadoTributacaoDocumento)
- Logs de auditoria do cálculo (passos aplicados, valores intermediários) em modo debug
**Critérios de aceitação.** 
1. Teste integrado: NF-e SP → MG, 3 itens (1 com ST, 1 sem, 1 importado), totais batem
2. Memória de cálculo recuperável para auditoria
**Dependências.** TSK-063, TSK-064, TSK-065, TSK-066, TSK-067, TSK-068, TSK-069, TSK-070


#### TSK-072  ·  5 pts   Endpoint /tax/simulate e preview de tributação no frontend

**Descrição.** API que recebe itens + cliente + empresa e retorna o cálculo (sem persistir).
**Checklist técnico.** 
- POST /tax/simulate com payload de itens e contexto
- Resposta inclui valores por item + totais + warnings (configurações faltantes)
- Frontend usa esse endpoint na pré-visualização da NF-e
- Cache de 5 min por payload idêntico (perf)
**Critérios de aceitação.** 
1. Faturista altera quantidade de item; preview atualiza em < 500ms
2. Cenários sem regra cadastrada retornam mensagem clara (não 500)
**Dependências.** TSK-071


## EP-05 — Infraestrutura Compartilhada: Filas, Cofre, Observabilidade


**Resumo. **BullMQ, integração com Vault, OpenTelemetry e auditoria — todas as fundações que módulos fiscais e financeiros vão consumir.


*Conteúdo: 5 tarefas · Total: 21 pontos*


#### TSK-090  ·  3 pts · B I   BullMQ: configuração base e padrões de worker

**Descrição.** Filas configuradas (Redis), worker base com retry, backoff e observabilidade.
**Checklist técnico.** 
- Instalar bullmq + ioredis
- Padrão BaseWorker em infrastructure/queues com hooks para tracing
- Configuração de filas: nfe-emit, nfe-distribuicao, focus-webhook, import-xml, reports
- Política de retry: exponential backoff, max 5 tentativas, DLQ para falhas finais
- Dashboard Bull Board em ambiente não-produção
**Critérios de aceitação.** 
1. Job de teste é enfileirado, processado, retry funciona em falha simulada
2. Métricas: jobs/min, tempo médio, taxa de erro por fila expostas via Prometheus
**Dependências.** TSK-008


#### TSK-091  ·  5 pts · B   Adapter de cofre de segredos (Vault ou Secrets Manager)

**Descrição.** Interface ICertificateVault no domain; implementações para HashiCorp Vault e AWS Secrets Manager intercambiáveis.
**Checklist técnico.** 
- Interface: storeCertificate, retrieveCertificate, listCertificates, rotateAccess, revoke
- Certificado armazenado como conteúdo binário + metadados (validFrom, validTo, subject)
- Audit trail: cada acesso ao certificado registra quem, quando, para qual operação
- Implementação Vault como padrão; mock em memória para testes
- Configuração via env: tipo de vault, endpoint, credenciais (que ficam em variáveis seguras do orquestrador)
- ADR-006: 'Por que cofre externo e nunca em banco'
**Critérios de aceitação.** 
1. Subir um certificado, recuperar, listar, revogar — fim a fim no Vault local
2. Tentar acessar sem permissão retorna erro auditado
3. Mock funciona para testes unitários sem subir Vault
**Dependências.** TSK-005


#### TSK-092  ·  5 pts   OpenTelemetry: tracing, métricas e logs correlacionados

**Descrição.** Instrumentação automática para Express, TypeORM, BullMQ e HTTP outbound.
**Checklist técnico.** 
- OTel SDK + auto-instrumentations
- Resource attributes: service.name, service.version, deployment.environment
- Trace ID propagado no logger (mesmo requestId)
- Métricas custom: emissoes_total{cstat}, contingencia_ativa, latencia_sefaz
- Exporters: OTLP HTTP (compatível com Tempo, Jaeger, Datadog)
**Critérios de aceitação.** 
1. Em ambiente local com docker (Tempo + Grafana), uma requisição HTTP aparece com spans de DB e fila
2. Logs aparecem correlacionados ao trace no Grafana
**Dependências.** TSK-005


#### TSK-093  ·  5 pts · I   Auditoria: entidade AuditLog e service centralizado

**Descrição.** AuditLog imutável, append-only, com decorator/helper para registro em use cases.
**Checklist técnico.** 
- Entidade AuditLog (companyId, userId, action, entityType, entityId, ipAddress, userAgent, payload, occurredAt)
- Tabela append-only: revogar UPDATE/DELETE via política no Postgres
- AuditService.record(action, context) com retry assíncrono via fila se falhar (não pode quebrar a operação principal)
- Decorator @Audited('nfe.emit') opcional para use cases simples
- Listagem com filtros para tela de auditoria do admin
**Critérios de aceitação.** 
1. Cada operação sensível gera 1 registro de auditoria
2. Falha no AuditService não bloqueia a operação (degradação graciosa)
3. Tentar UPDATE em audit_logs falha na política do banco
**Dependências.** TSK-024


#### TSK-094  ·  3 pts   Notificações: entidade e mecanismo de inbox

**Descrição.** Notification para inbox no header da UI (rejeições, alertas de certificado, etc.).
**Checklist técnico.** 
- Entidade Notification (companyId, userId nullable, category, title, message, severity, link)
- NotificationService.notify() chamado pelos use cases
- Endpoint GET /notifications com paginação + count de não lidas
- Endpoint PATCH /notifications/:id/read
- Frontend: badge no header + drawer com lista
**Critérios de aceitação.** 
1. Faturista vê notificação de rejeição em tempo razoável (polling 30s ou WebSocket)
2. Marcar como lida funciona; persistência em readAt
**Dependências.** TSK-093


## 3. Fase 1a — Núcleo SEFAZ (NF-e modelo 55)


A fase mais técnica e crítica do MVP. Implementa toda a comunicação com SEFAZ: composição do XML, validação local (XSD + regras das NTs), assinatura XML-DSig com canonicalização C14N, transmissão SOAP, tratamento de retornos, eventos e contingência. Esta é a parte do produto onde “quase certo” gera rejeições em massa — exige rigor e validação fiscal contínua.


**Critério de saída da fase: **é possível emitir uma NF-e modelo 55 simples em ambiente de homologação da SEFAZ-SP, receber autorização (cStat 100), gerar DANFE e cancelar a nota dentro do prazo.


## EP-06 — Cliente SOAP SEFAZ e Custódia de Certificado


**Resumo. **Camada de comunicação com web services oficiais por UF, e uso do certificado em cofre para assinatura.


*Conteúdo: 4 tarefas · Total: 34 pontos*


#### TSK-100  ·  8 pts · B F   Composição de XML da NF-e (schema 4.00 + RT 2025.002)

**Descrição.** Builder programático que monta o XML respeitando o schema oficial vigente.
**Checklist técnico.** 
- Usar xmlbuilder2 para composição
- Mapeamento entidade → grupos do XML: ide, emit, dest, det (itens), total, transp, pag, infAdic
- Tratamento de IBS/CBS/IS conforme RT 2025.002 (grupos novos por item + totais)
- Validação contra XSD oficial via libxmljs (ou xmllint via subprocess)
- Coleção de testes com XMLs gerados validados contra schema oficial
**Critérios de aceitação.** 
1. XML gerado para nota simples passa em validação XSD oficial
2. XML com IBS/CBS preenchidos no modo ano-teste passa em validação
3. Especialista revisa estrutura e assina off
**Dependências.** TSK-071


#### TSK-101  ·  13 pts · B F I   Assinatura XML-DSig com canonicalização C14N

**Descrição.** Assinatura do XML usando o certificado custodiado no cofre, com canonicalização correta — ponto mais sensível tecnicamente.
**Checklist técnico.** 
- Usar xml-crypto com algoritmo RSA-SHA256
- Canonicalização: Exclusive XML Canonicalization (C14N) — http://www.w3.org/2001/10/xml-exc-c14n#
- Reference correta para o elemento <infNFe> com Id atribuído
- Buscar certificado no cofre por companyId; usar PEM extraído do PKCS#12
- Validar a assinatura própria após gerar (round-trip)
- Tratamento de certificado A3 (HSM/token físico) — documentar limitações ou deferir para v2
- Suite de testes com XMLs do MOC oficial (assinados de referência)
**Critérios de aceitação.** 
1. XML assinado pelo nosso código valida em ferramentas externas (xmlsec1 CLI)
2. Round-trip: assinar → validar volta true
3. Trocar 1 byte do XML após assinatura faz validação falhar
4. Especialista fiscal valida pelo menos 5 XMLs gerados em homologação SEFAZ
**Dependências.** TSK-100, TSK-091


#### TSK-102  ·  8 pts · B I   Cliente SOAP SEFAZ por UF

**Descrição.** Adapter que sabe rotear chamadas para o web service correto por UF e ambiente.
**Checklist técnico.** 
- Tabela de endpoints por UF (homologação + produção) — começar com SP, RS, MG, BA, AM cobrindo Sefaz Virtual também
- Cliente HTTPS com mTLS (certificado do cliente + chave) — usa cert do cofre
- Composição do envelope SOAP correto (nfeAutorizacao4, nfeRetAutorizacao4, etc.)
- Timeout configurável; retry só em erros 5xx ou network (nunca em erro de negócio)
- Persistência de SefazTransmission (request + response + status + duração)
- Worker dedicado em fila nfe-emit
**Critérios de aceitação.** 
1. Status do serviço (cStat 107) consultado em homologação SP retorna sucesso
2. Todas as chamadas geram registro em SefazTransmission
3. Falhas transitórias têm retry; falhas permanentes não
**Dependências.** TSK-101, TSK-090


#### TSK-103  ·  5 pts   Estratégia multi-UF: contingência SVC e roteamento

**Descrição.** Quando SEFAZ da UF está fora, rotear para SVC-AN ou SVC-RS conforme regras.
**Checklist técnico.** 
- Monitor de saúde das SEFAZ (consulta periódica de status)
- Detecção de indisponibilidade: 3 falhas consecutivas ou cStat 999
- Decisão automática de roteamento para SVC apropriada por UF
- Marcar empresa em modo contingência e log de auditoria
- Notificação aos faturistas
**Critérios de aceitação.** 
1. Simular SEFAZ-SP fora: emissão é redirecionada para SVC sem intervenção
2. Quando SEFAZ volta, novas emissões usam endpoint normal
**Dependências.** TSK-102


## EP-07 — Emissão de NF-e: Use Case e Ciclo de Vida


**Resumo. **Use case EmitirNFe end-to-end com idempotência, pré-validação, transmissão, tratamento de retorno e persistência.


*Conteúdo: 6 tarefas · Total: 40 pontos*


#### TSK-110  ·  8 pts · B F   Modelagem TypeORM: NFe, NFeItem, NFePagamento, NFeReferencia, NFeEvento

**Descrição.** Entidades fiscais centrais com todos os campos da v1.3 do schema (DIFAL, ST, FCP, ICMS desonerado, IBS/CBS/IS).
**Checklist técnico.** 
- 5 entidades com decorators TypeORM + relações
- Constraints: chaveAcesso única, (companyId,modelo,serie,numero) único, idempotencyKey único
- Migration que cria tabelas com índices apropriados (dhEmissao, status, customerId)
- Repositórios + interfaces no domain
**Critérios de aceitação.** 
1. Migration up + down testada
2. Criar NFe com 50 itens e testar performance: < 500ms
**Dependências.** TSK-042


#### TSK-111  ·  8 pts · I F   Use case EmitirNFe com idempotência

**Descrição.** Composição → motor tributário → validação local → assinatura → transmissão → tratamento.
**Checklist técnico.** 
- Validação de entrada (cliente existe, produtos existem, regras vigentes, série válida)
- Reserva transacional de numeração (lock pessimista em NumberingSeries)
- idempotencyKey fornecida pelo cliente; se já existe NFe com essa key, retorna a existente
- Encadeia: motor tributário → builder XML → validador XSD → assinador → cliente SOAP
- Persiste NFe com status PROCESSING; atualiza para AUTHORIZED ou REJECTED conforme retorno
- Em rejeição: persiste motivo, permite correção; não consome numeração se cStat for de rejeição definitiva
**Critérios de aceitação.** 
1. Emissão completa em homologação SP funciona fim a fim
2. Mesma idempotencyKey enviada 3x retorna a mesma NFe (não duplica)
3. Rejeição por dado inválido retorna mensagem traduzida ao cliente
4. Em caso de timeout: nota fica PROCESSING e job de reconciliação resolve
**Dependências.** TSK-110, TSK-102, TSK-072


#### TSK-112  ·  5 pts · I   Worker de reconciliação: notas PROCESSING não resolvidas

**Descrição.** Job periódico que reconsulta SEFAZ para notas que ficaram em PROCESSING por mais de X minutos.
**Checklist técnico.** 
- Cron job a cada 2 min: lista NFe com status PROCESSING há > 1 min
- Para cada uma: nfeConsultaProtocolo na SEFAZ pela chave
- Atualiza status conforme retorno
- Limite de tentativas antes de marcar ERROR e notificar humano
**Critérios de aceitação.** 
1. Cenário simulado: SEFAZ não responde no momento da emissão; nota fica PROCESSING; em 2 min é resolvida pela reconciliação
**Dependências.** TSK-111


#### TSK-113  ·  8 pts · F I   Eventos: Cancelamento, CC-e, Inutilização

**Descrição.** Use cases para cancelar dentro do prazo, emitir Carta de Correção e inutilizar faixa de numeração.
**Checklist técnico.** 
- CancelarNFeUseCase: valida prazo (24h padrão), permissão, justificativa mín 15 chars
- EmitirCCeUseCase: até 20 correções, valendo a última; campos corrigíveis conforme MOC
- InutilizarNumeracaoUseCase: para inutilização de faixa não usada (justificativa)
- Cada evento gera NFeEvento e atualiza NFe.status apropriadamente
- Estornos automáticos no financeiro/estoque ao cancelar (gancho para EP-19/Fase 2)
**Critérios de aceitação.** 
1. Cancelamento dentro de 24h funciona; fora retorna erro orientando alternativas
2. CC-e até 20: 21ª tentativa é bloqueada
3. Inutilização funciona; faixa inutilizada não pode ser reusada
**Dependências.** TSK-111


#### TSK-114  ·  3 pts · F   Eventos: Ator Interessado, Insucesso na Entrega

**Descrição.** Eventos opcionais previstos no MOC.
**Checklist técnico.** 
- AtorInteressadoUseCase: registra transportadora ou destinatário como ator
- InsucessoEntregaUseCase: declara insucesso na entrega
**Critérios de aceitação.** 
1. Cada evento emite o XML correto e atualiza histórico
**Dependências.** TSK-113


#### TSK-115  ·  8 pts · F I   Contingência EPEC: emitir, autorizar offline, reprocessar

**Descrição.** Fluxo de Evento Prévio de Emissão em Contingência quando SEFAZ + SVC indisponíveis.
**Checklist técnico.** 
- Modo contingência ativado manualmente pelo admin ou automaticamente
- Emissão gera NFeEvento de EPEC e marca a nota com formaEmissao = CONTINGENCIA_EPEC
- DANFE com tarja de contingência
- Job de reprocessamento: tenta transmitir as notas em contingência quando SEFAZ volta
- Saída de contingência: comando manual após confirmação que todas as notas pendentes foram transmitidas
**Critérios de aceitação.** 
1. Cenário simulado: SEFAZ + SVC fora → emissão funciona em modo EPEC → SEFAZ volta → notas são reprocessadas automaticamente
**Dependências.** TSK-113, TSK-103


## EP-08 — DANFE e Documentos Acessórios


**Resumo. **Geração do DANFE em PDF, envio por e-mail e armazenamento dos artefatos.


*Conteúdo: 3 tarefas · Total: 14 pontos*


#### TSK-120  ·  8 pts · F   Template DANFE em React-PDF

**Descrição.** DANFE conforme MOC vigente, com suporte a layouts adaptados para IBS/CBS/IS.
**Checklist técnico.** 
- Setup @react-pdf/renderer no backend (renderToBuffer)
- Componentes: Cabeçalho, EmitenteDestinatario, ItensTabela, Totais, TransporteFatura, AdicionaisFisco
- Tratamento de paginação para notas com muitos itens
- Código de barras da chave de acesso (lib bwip-js)
- QR Code para consulta na SEFAZ
- Tarja de contingência quando aplicável
**Critérios de aceitação.** 
1. DANFE de NF-e simples gera em < 2s
2. Layout validado contra modelos oficiais por especialista
3. 100 itens: paginação correta, sem texto cortado
**Dependências.** TSK-111


#### TSK-121  ·  3 pts   Armazenamento de XML e DANFE em object storage

**Descrição.** Adapter para S3-compatible storage (S3, MinIO) com URLs assinadas para download.
**Checklist técnico.** 
- Interface IDocumentStorage no domain
- Implementação S3 com upload, getSignedUrl (TTL configurável)
- Convenção de paths: /{companyId}/nfe/{ano}/{mes}/{chave}.xml e .pdf
- MinIO no docker-compose para dev
**Critérios de aceitação.** 
1. Upload e geração de URL assinada (TTL 15min) funciona
2. URL expirada retorna 403
**Dependências.** TSK-008


#### TSK-122  ·  3 pts   Envio de XML + DANFE por e-mail ao destinatário

**Descrição.** Após autorização, envio automático ou manual ao e-mail do cliente.
**Checklist técnico.** 
- Adapter IMailer (SES, Mailgun, SMTP)
- Template HTML básico com botões para download
- Configuração por empresa: enviar automático ou exigir ação manual
- Retry assíncrono em fila
**Critérios de aceitação.** 
1. E-mail chega com XML e DANFE anexados
2. Falha de envio é retentada e notificada após esgotamento
**Dependências.** TSK-120, TSK-121, TSK-090


## EP-09 — Frontend Fiscal: Emissão de NF-e


**Resumo. **Telas de composição, preview, emissão, listagem e ações de NF-e.


*Conteúdo: 4 tarefas · Total: 28 pontos*


#### TSK-130  ·  13 pts · E2E   Tela 'Nova NF-e': composição completa

**Descrição.** Formulário em etapas (cliente → itens → frete/pagamento → totais) seguindo o fluxo crítico 2.
**Checklist técnico.** 
- Step 1: seleção/cadastro rápido de cliente com validação fiscal inline
- Step 2: tabela de itens com adicionar/remover/duplicar, busca de produtos com autocomplete
- Pré-visualização tributária em tempo real (debounced 500ms; chama /tax/simulate)
- Step 3: frete, pagamento (com suporte a múltiplos pagamentos), informações adicionais
- Step 4: preview do DANFE + resumo de tributos + botão 'Emitir'
- Validação inline com Zod; bloqueia avanço se inválido
- Auto-save em rascunho a cada 30s
**Critérios de aceitação.** 
1. Faturista emite uma NF-e simples em menos de 3 min (UX validada)
2. Tributação muda em tempo real ao adicionar/remover itens
3. Rascunho recuperado após refresh do navegador
4. E2E: emissão completa em homologação
**Dependências.** TSK-111, TSK-072, TSK-045


#### TSK-131  ·  5 pts · E2E   Listagem de NF-e emitidas com filtros e ações

**Descrição.** Tela /fiscal/nfe com filtros, status visual e ações contextuais.
**Checklist técnico.** 
- Filtros: período, cliente, status, série, valor
- Ordenação e paginação cursor-based
- Ações por linha: ver detalhes, baixar XML, baixar DANFE, cancelar, CC-e, reenviar email
- Visualização de status com cores semânticas (AUTHORIZED verde, REJECTED vermelho, etc.)
- Export para Excel da listagem filtrada
**Critérios de aceitação.** 
1. Listar 10.000 NF-e: primeira página em < 500ms
2. Ações respeitam permissões (botão de cancelar não aparece para quem não tem nfe.cancel)
**Dependências.** TSK-113, TSK-130


#### TSK-132  ·  5 pts   Tela de detalhes de NF-e + histórico de eventos

**Descrição.** View completa: dados da nota, itens com tributação, eventos, timeline.
**Checklist técnico.** 
- Tabs: Resumo, Itens, Tributação detalhada, Eventos (timeline), XML/DANFE
- Botões de ação consistentes com a listagem
- Memória de cálculo do motor tributário disponível em modo debug
**Critérios de aceitação.** 
1. Fiscal consegue auditar uma nota completa sem precisar consultar o banco
**Dependências.** TSK-131


#### TSK-133  ·  5 pts · E2E   Modais de Cancelamento, CC-e e Inutilização

**Descrição.** Diálogos com regras de prazo, justificativa e dupla confirmação.
**Checklist técnico.** 
- Cancelamento: aviso se fora de prazo, sugestão de CC-e ou nota de ajuste
- CC-e: contador de correções restantes, lista de campos permitidos
- Inutilização: confirmação dupla, justificativa obrigatória
- Toasts de sucesso/erro consistentes
**Critérios de aceitação.** 
1. Cada ação destrutiva exige confirmação explícita conforme o fluxo crítico 5
2. E2E cobre os 3 cenários
**Dependências.** TSK-113, TSK-131


## 4. Fase 1b — Recepção SEFAZ e NFS-e via Focus NF-e


Completa o fluxo de entrada (notas contra o CNPJ via Distribuição de DF-e da SEFAZ) e o de saída de serviços (NFS-e Nacional e municipal via Focus). Ambos usam a camada anticorrupção definida em EP-05.


**Critério de saída: **é possível receber automaticamente notas emitidas contra a empresa, manifestar-se sobre elas, escriturá-las gerando título a pagar; e emitir NFS-e em pelo menos um município pelo padrão nacional.


## EP-10 — Distribuição de DF-e da SEFAZ (Recepção)


**Resumo. **Worker que consulta DF-e por NSU, persiste documentos recebidos e mantém cursor por CNPJ.


*Conteúdo: 4 tarefas · Total: 16 pontos*


#### TSK-140  ·  5 pts · B   Modelagem TypeORM: NsuCursor, ReceivedDocument, ReceivedDocumentVersion

**Descrição.** Entidades para suportar a recepção incremental e versionamento de eventos posteriores.
**Checklist técnico.** 
- NsuCursor: companyId + origem (sefaz_nfe_cte) + cursorValue
- ReceivedDocument: chave, tipo (NFE/CTE/NFSE), emitente, valor, status, xml/resumo, origemCaptura
- ReceivedDocumentVersion: histórico de mudanças (CCE, cancelamento posterior)
- Constraint: chaveAcesso única por empresa
- Migration + repositórios
**Critérios de aceitação.** 
1. CRUD via testes; constraint funciona
**Dependências.** TSK-024


#### TSK-141  ·  5 pts · I F   Cliente SOAP: nfeDistribuicaoDFe

**Descrição.** Implementar serviço de Distribuição de DF-e da SEFAZ com paginação por NSU.
**Checklist técnico.** 
- Endpoint nfeDistribuicaoDFe (ambiente Nacional)
- Payload com CNPJ + ultNSU; retorna até 50 documentos por chamada
- Decodificação de schemaCompressao gzip + base64
- Tratamento de cStat: 137 (documentos localizados), 138 (sem novidades), erros
- Persistência de cada documento em ReceivedDocument
- Atualização atômica do NsuCursor.cursorValue após processar lote
**Critérios de aceitação.** 
1. Em homologação SEFAZ, consulta por CNPJ retorna lista (mesmo que vazia)
2. Cursor avança corretamente; reexecução não duplica
**Dependências.** TSK-140, TSK-102


#### TSK-142  ·  3 pts   Worker agendado: distribuição periódica por empresa

**Descrição.** Cron job que dispara consulta para cada empresa ativa a cada 15-30 min (configurável).
**Checklist técnico.** 
- Trigger BullMQ repeatable por empresa
- Configuração de intervalo por empresa (default 15 min)
- Logs estruturados: documentos novos, NSU final
- Notificação inbox quando há documentos novos
**Critérios de aceitação.** 
1. Em ambiente com fixture, worker roda, busca, persiste e notifica
**Dependências.** TSK-141, TSK-094


#### TSK-143  ·  3 pts · I   Download do XML completo após manifestação

**Descrição.** Primeiro a SEFAZ retorna resumo; XML completo só após manifestação. Implementar fetch sob demanda.
**Checklist técnico.** 
- Endpoint nfeDistribuicaoDFe com chave específica + NSU
- Atualizar ReceivedDocument.xmlCompleto
- Trigger automático após manifestação bem-sucedida
**Critérios de aceitação.** 
1. Manifestar uma nota: XML completo é baixado automaticamente
**Dependências.** TSK-141


## EP-11 — Manifestação do Destinatário


**Resumo. **Eventos de manifestação (ciência, confirmação, desconhecimento, operação não realizada) com prazos e auditoria.


*Conteúdo: 2 tarefas · Total: 13 pontos*


#### TSK-150  ·  5 pts · F I   Use case ManifestarDestinatario

**Descrição.** Envio de evento à SEFAZ com tipo, justificativa quando aplicável e atualização do estado do recebido.
**Checklist técnico.** 
- Composição do XML do evento (tpEvento por tipo de manifestação)
- Assinatura com certificado da empresa que recebe
- Transmissão via cliente SEFAZ
- Validação de prazo (180 dias para ciência; outros variam)
- Atualização de ReceivedDocument com status e DfeManifestation com retorno
**Critérios de aceitação.** 
1. Manifestar uma nota em homologação SEFAZ funciona para os 4 tipos
2. Manifestar fora do prazo retorna erro orientado
**Dependências.** TSK-142, TSK-101


#### TSK-151  ·  8 pts · E2E   Frontend: Inbox de notas recebidas + manifestação

**Descrição.** Tela /fiscal/recebidas com lista, filtros e diálogos de manifestação.
**Checklist técnico.** 
- Listagem com filtros: pendentes de manifestação, manifestadas, escrituradas
- Visualização do XML/DANFE da nota recebida
- Modal de manifestação com 4 opções e campos contextuais
- Indicador visual de prazo restante (verde > 30d, amarelo 7-30d, vermelho < 7d)
- Ação em lote: ciência para múltiplas notas
**Critérios de aceitação.** 
1. Comprador identifica e manifesta uma nota em < 1 min
2. E2E: receber → ciência → confirmar operação → ver XML completo
**Dependências.** TSK-150


## EP-12 — Importação por XML/PDF e Conferência com Pedido


**Resumo. **Importação manual quando captura automática não cobre, com extração de dados de PDF.


*Conteúdo: 3 tarefas · Total: 16 pontos*


#### TSK-160  ·  3 pts · I   Upload de XML único e em lote

**Descrição.** Upload de XMLs (drag-drop ou seletor) com validação e deduplicação.
**Checklist técnico.** 
- Endpoint POST /received/upload-xml com multipart
- Parser fast-xml-parser; valida estrutura mínima
- Deduplicação por chave de acesso; se já existe, atualiza
- Lote: processar em fila para arquivos > 10 XMLs
**Critérios de aceitação.** 
1. Upload de ZIP com 50 XMLs processa em background
**Dependências.** TSK-140


#### TSK-161  ·  8 pts   Extração de dados de DANFE em PDF (OCR + heurística)

**Descrição.** Extrair chave de acesso e dados básicos de PDF de DANFE; quando há chave, prioriza fetch do XML real.
**Checklist técnico.** 
- Lib pdf-parse + tesseract.js para PDFs escaneados
- Heurísticas para extrair chave (44 dígitos, padrão visual)
- Quando chave detectada: tenta buscar XML na SEFAZ via consulta avulsa (se config permitir)
- Quando não há chave: extração best-effort com revisão manual obrigatória
- Tela de revisão dos dados extraídos antes de persistir
**Critérios de aceitação.** 
1. DANFE digital: chave extraída automaticamente em > 90% dos casos
2. PDF escaneado: extração funciona com OCR (mais lenta, com loading)
**Dependências.** TSK-160


#### TSK-162  ·  5 pts · E2E   Vínculo com pedido de compra e conferência

**Descrição.** Para notas recebidas, vincular ao pedido (manual ou automático por fornecedor + valor) e conferir item a item.
**Checklist técnico.** 
- Match automático: mesmo fornecedor + valor total compatível ± 1%
- Match manual quando automático falha (busca de pedidos abertos)
- Tela de conferência item-a-item com destaque de divergências
- Aprovação por alçada quando divergência > limite configurável
**Critérios de aceitação.** 
1. Match automático funciona em > 70% dos casos
2. Conferência manual leva < 2 min para nota típica
**Dependências.** TSK-161


## EP-13 — Cliente Focus NF-e e Camada Anticorrupção


**Resumo. **Adapter REST Focus, gestão de webhook, idempotência e abstração da emissão de NFS-e.


*Conteúdo: 4 tarefas · Total: 14 pontos*


#### TSK-170  ·  3 pts · I   Cliente HTTP Focus NF-e com retry, timeout e logging

**Descrição.** Cliente axios/undici instrumentado, com token do cofre e auditoria via FocusRequest.
**Checklist técnico.** 
- FocusHttpClient com baseURL por ambiente (homologação/produção)
- Bearer token recuperado do cofre por empresa
- Retry exponencial em 5xx e network errors (não em 4xx)
- Timeout configurável (default 30s)
- Persistência em FocusRequest de cada chamada
- Tratamento de redirecionamento 302 para download de XML/PDF (URL pré-assinada)
**Critérios de aceitação.** 
1. Chamadas autenticadas funcionam em homologação Focus
**Dependências.** TSK-091


#### TSK-171  ·  3 pts   Provisionamento de empresa na Focus (com dry-run)

**Descrição.** Use case ProvisionarEmpresaFocusUseCase chamando API de Empresas com simulação primeiro.
**Checklist técnico.** 
- Primeiro chama dry_run=true; valida resposta
- Se OK, chama com dry_run=false
- Persiste token gerado em IntegrationCredential (cofre)
- Idempotente: se empresa já existe na Focus, busca e atualiza
**Critérios de aceitação.** 
1. Onboarding de empresa cria empresa na Focus em homologação
**Dependências.** TSK-170


#### TSK-172  ·  5 pts · I   Receptor de webhooks Focus (autenticado + idempotente)

**Descrição.** Endpoint público que recebe eventos da Focus, valida assinatura, processa de forma idempotente.
**Checklist técnico.** 
- Endpoint POST /webhooks/focus-nfe (sem auth JWT; auth por HMAC)
- Validação de assinatura HMAC com segredo armazenado em Webhook.secret
- Persistência em WebhookEvent com dedupe por (source, externalEventId)
- Processamento assíncrono via fila
- Retorna 200 mesmo em duplicata (Focus não reenvia o mesmo)
**Critérios de aceitação.** 
1. Webhook autêntico é processado; signature inválida retorna 401
2. Mesmo eventId enviado 3x produz 1 efeito apenas
**Dependências.** TSK-090, TSK-093


#### TSK-173  ·  3 pts   Fallback de polling para webhooks perdidos

**Descrição.** Job periódico que reconsulta status de documentos NFS-e em PROCESSING há muito tempo.
**Checklist técnico.** 
- Cron 5 min: lista NFS-e PROCESSING > 5 min
- Consulta Focus por ID/chave; atualiza status
- Após N falhas: notifica humano
**Critérios de aceitação.** 
1. Webhook propositalmente derrubado: nota é resolvida via polling em até 10 min
**Dependências.** TSK-172


## EP-14 — Emissão de NFS-e (Nacional e Municipal)


**Resumo. **Use cases e UI para emitir NFS-e via Focus, roteando entre padrão nacional e municipal.


*Conteúdo: 4 tarefas · Total: 26 pontos*


#### TSK-180  ·  5 pts · B   Modelagem TypeORM: NFSe, NFSeItem, NFSeEvento, FocusRequest

**Descrição.** Entidades fiscais para serviços.
**Checklist técnico.** 
- Todos os campos da v1.3 (caminhoEmissao, padraoNacional, IBS/CBS, retenções, cIndOp, indZfmAlc)
- FocusRequest para auditoria de chamadas
- Migrations e repositórios
**Critérios de aceitação.** 
1. CRUD e constraints testados
**Dependências.** TSK-043


#### TSK-181  ·  8 pts · F I   Use case EmitirNFSe

**Descrição.** Composição → motor tributário → roteamento (Nacional × municipal) → submissão à Focus → tratamento de retorno.
**Checklist técnico.** 
- Resolver caminho: consulta tabela de municípios migrados (mantida pela Focus, cacheada)
- Composição DPS para Nacional ou payload municipal específico
- Submissão à Focus com idempotencyKey
- Persistência em NFSe com status PROCESSING
- Atualização via webhook (TSK-172) ou polling (TSK-173)
**Critérios de aceitação.** 
1. Emissão em homologação Focus funciona para pelo menos 3 municípios diferentes
2. Roteamento correto Nacional × municipal
**Dependências.** TSK-180, TSK-070, TSK-172


#### TSK-182  ·  5 pts   Eventos NFS-e: Cancelamento e Substituição

**Descrição.** Eventos suportados pela Focus para NFS-e.
**Checklist técnico.** 
- Cancelamento com motivo e prazo por município
- Substituição quando município permite
- Atualização de NFSe.status
**Critérios de aceitação.** 
1. Cancelamento funciona em homologação para municípios que suportam
**Dependências.** TSK-181


#### TSK-183  ·  8 pts · E2E   Frontend: Emissão e listagem de NFS-e

**Descrição.** Telas análogas às de NF-e, adaptadas para serviços.
**Checklist técnico.** 
- Composição: tomador, serviços (discriminação livre + itens), preview tributário
- Listagem com filtros, ações (cancelar, baixar DANFSe)
- Indicação visual do município/caminho de emissão
**Critérios de aceitação.** 
1. Faturista emite NFS-e em < 3 min
2. E2E em homologação
**Dependências.** TSK-181, TSK-130


## 5. Fase 1c — MVP Fiscal Completo


Fecha o MVP com relatórios mensais fiscais, apuração assistida e dashboard inicial. Após esta fase, o produto está pronto para operação real no ano-teste 2026.


**Critério de saída: **usuário consegue executar o fechamento mensal completo (checklist → manifestações pendentes → escrituração → apuração → relatórios → exportação para contabilidade) seguindo o fluxograma 7.


## EP-15 — Relatórios Fiscais Mensais


**Resumo. **Mapas de entradas, saídas, serviços, apuração IBS/CBS e divergências fiscais.


*Conteúdo: 7 tarefas · Total: 34 pontos*


#### TSK-190  ·  5 pts   Service de relatórios + query builder genérico

**Descrição.** Camada de relatórios com query builder seguro e cacheável.
**Checklist técnico.** 
- ReportService com método generate(reportId, filters)
- Filtros padronizados: período, empresa, filial, tributo
- Queries otimizadas com índices apropriados
- Cache de 5 min por (reportId, filters hash)
**Critérios de aceitação.** 
1. Framework testado com 1 relatório piloto
**Dependências.** TSK-111, TSK-180


#### TSK-191  ·  5 pts · F   Relatório: Mapa de Entradas (Mensal)

**Descrição.** Notas de entrada + serviços tomados, por CFOP, fornecedor, tributo, com créditos apropriados.
**Checklist técnico.** 
- Query agregada com totais por dimensão
- Exportação em PDF (pdfkit) e XLSX (exceljs)
- Coluna especial de créditos IBS/CBS
**Critérios de aceitação.** 
1. Relatório bate com soma manual de notas em ambiente de teste
**Dependências.** TSK-190


#### TSK-192  ·  5 pts · F   Relatório: Mapa de Saídas (Mensal)

**Descrição.** NF-e e NFS-e emitidas, por natureza, cliente, tributo, com débitos gerados.
**Checklist técnico.** 
- Análogo ao de entradas, adaptado
**Critérios de aceitação.** 
1. Validação fiscal
**Dependências.** TSK-190


#### TSK-193  ·  3 pts · F   Relatório: Serviços Prestados e Tomados

**Descrição.** Detalhamento por item da lista de serviços, com retenções.
**Checklist técnico.** 
- Foco em retenções ISS, IBS/CBS, PIS/COFINS/CSLL
**Critérios de aceitação.** 
1. Validação fiscal
**Dependências.** TSK-190


#### TSK-194  ·  8 pts · F I   Apuração Assistida de IBS/CBS

**Descrição.** Demonstrativo de débitos × créditos do período, saldo, memória de cálculo por documento.
**Checklist técnico.** 
- Cálculo de débitos: somatório por tributo das saídas
- Cálculo de créditos: somatório das entradas escrituradas
- Saldo: débito - crédito; identificar a recolher ou a restituir
- Memória de cálculo: lista cada NFe que compõe o total
- Modo ano-teste 2026: marca como 'simbólico, sem recolhimento'
**Critérios de aceitação.** 
1. Apuração de mês com 100 NFe roda em < 5s
2. Especialista valida o memorial contra apuração manual
**Dependências.** TSK-191, TSK-192


#### TSK-195  ·  3 pts   Relatório de Divergências Fiscais

**Descrição.** Notas capturadas sem escrituração, sem manifestação, ou com CST/cClassTrib incompletos.
**Checklist técnico.** 
- Query identificando os 3 tipos de divergência
- Drill-down: clicar abre o documento problemático
**Critérios de aceitação.** 
1. Aparece no painel de fechamento mensal
**Dependências.** TSK-191


#### TSK-196  ·  5 pts   Frontend: Página de Relatórios com filtros e download

**Descrição.** Tela única para listar e gerar relatórios com filtros parametrizados.
**Checklist técnico.** 
- Lista de relatórios disponíveis com descrição
- Filtros dinâmicos por relatório
- Download em PDF ou XLSX
- Histórico de gerações por usuário
**Critérios de aceitação.** 
1. Fiscal gera os 5 relatórios principais em < 2 min cada
**Dependências.** TSK-191, TSK-192, TSK-193, TSK-194, TSK-195


## EP-16 — Fluxo de Fechamento Mensal


**Resumo. **Painel orquestrador do fechamento, com checklist de pendências e bloqueio de período.


*Conteúdo: 3 tarefas · Total: 16 pontos*


#### TSK-200  ·  5 pts · F   Use case CalcularChecklistFechamento

**Descrição.** Calcula as 5 categorias de pendência do mês para empresa.
**Checklist técnico.** 
- Notas DRAFT/PENDING
- Notas recebidas sem manifestação (filtro por prazo)
- Notas recebidas sem escrituração
- Eventos pendentes de transmissão
- Divergências CST/cClassTrib
**Critérios de aceitação.** 
1. Retorna contagem por categoria + lista de itens
**Dependências.** TSK-150, TSK-162, TSK-195


#### TSK-201  ·  3 pts · F I   Use case BloquearPeriodoFechado

**Descrição.** Após fechamento, bloqueia edição/emissão retroativa no período.
**Checklist técnico.** 
- Entidade FechamentoMes (companyId, ano, mes, fechadoEm, fechadoBy, snapshot)
- Validação em todos os use cases de emissão: data não pode estar em período fechado
- Auditoria do fechamento (com snapshot de totais)
- Operação de 'reabertura' restrita (com justificativa, dupla aprovação)
**Critérios de aceitação.** 
1. Tentar emitir NFe em mês fechado retorna erro orientado
2. Reabertura registrada em AuditLog
**Dependências.** TSK-094


#### TSK-202  ·  8 pts · E2E   Frontend: Painel de Fechamento Mensal

**Descrição.** Tela /fiscal/fechamento seguindo o fluxograma 7 do PRD.
**Checklist técnico.** 
- Seletor de período (mês/ano)
- Cards com 5 categorias de pendência
- Drill-down em cada card abre lista de itens com ação direta
- Botão 'Iniciar apuração' habilitado quando pendências zeradas ou justificadas
- Botão 'Fechar mês' com dupla confirmação e snapshot
- Histórico de fechamentos no rodapé
**Critérios de aceitação.** 
1. Fiscal completa fechamento de mês simulado seguindo apenas o painel
2. E2E ponta a ponta
**Dependências.** TSK-200, TSK-201, TSK-194, TSK-196


## EP-17 — Dashboard Inicial


**Resumo. **Visão executiva ao logar: indicadores fiscais e operacionais.


*Conteúdo: 2 tarefas · Total: 8 pontos*


#### TSK-210  ·  3 pts   Endpoint /dashboard com indicadores agregados

**Descrição.** API que retorna métricas-chave por empresa.
**Checklist técnico.** 
- NF-e emitidas no mês (total + valor)
- Notas recebidas pendentes de manifestação
- Próximas pendências fiscais (certificado a expirar, ano-teste)
- Status de saúde da integração SEFAZ/Focus
**Critérios de aceitação.** 
1. Endpoint retorna em < 500ms
**Dependências.** TSK-191


#### TSK-211  ·  5 pts   Frontend: Dashboard com cards e gráficos básicos

**Descrição.** Tela inicial após login.
**Checklist técnico.** 
- Cards de indicadores
- Mini-gráfico de emissões dos últimos 30 dias (Recharts)
- Lista de notificações recentes
- Atalhos para ações frequentes
**Critérios de aceitação.** 
1. Dashboard carrega em < 2s
**Dependências.** TSK-210


## EP-18 — Onboarding de Empresa (Wizard)


**Resumo. **Fluxo guiado para configurar empresa nova, conforme fluxograma 6.


*Conteúdo: 1 tarefas · Total: 8 pontos*


#### TSK-220  ·  8 pts · E2E   Frontend: Wizard de onboarding em 5 etapas

**Descrição.** Wizard com validação progressiva e modo homologação obrigatório antes de produção.
**Checklist técnico.** 
- Etapa 1: Dados básicos + CNPJ
- Etapa 2: CRT e flags fiscais (com explicação contextual)
- Etapa 3: Documentos que emite (NF-e/NFS-e) e configuração
- Etapa 4: Upload de certificado (NF-e) + provisionamento Focus (NFS-e)
- Etapa 5: Modo homologação ativo + sugestão de emissão de teste
- Botão final: alternar para PRODUÇÃO com dupla confirmação
- Auditoria de cada etapa concluída
**Critérios de aceitação.** 
1. Admin completa onboarding em < 15 min
2. Empresa em produção só após teste em homologação confirmado
**Dependências.** TSK-020, TSK-171, TSK-091


## 6. Fase 2 — Módulos Comercial e Financeiro


Completa a operação ponta a ponta: vendas, compras, contas a pagar/receber, fluxo de caixa, ECONF. Conectada aos módulos fiscais, fecha o ciclo de negócio.


## EP-19 — Vendas e Pedidos


**Resumo. **Pedidos de venda, faturamento integrado à emissão fiscal, devoluções.


*Conteúdo: 4 tarefas · Total: 26 pontos*


#### TSK-230  ·  5 pts · B   Modelagem: SalesOrder, SalesOrderItem, PriceList, PriceListItem

**Descrição.** Entidades comerciais.
**Checklist técnico.** 
- Entidades + migrations + repositórios
**Critérios de aceitação.** 
1. CRUD funcional
**Dependências.** TSK-040


#### TSK-231  ·  8 pts   Use case: criar/aprovar/faturar pedido de venda

**Descrição.** Ciclo de vida do pedido até gerar NFe ou NFSe.
**Checklist técnico.** 
- Criar pedido com itens + valores
- Aprovação por alçada (configurável)
- Faturar: dispara EmitirNFe ou EmitirNFSe + vincula via salesOrderId
- Faturamento parcial: suportar múltiplas NFs por pedido
**Critérios de aceitação.** 
1. Fluxo completo testado em E2E
**Dependências.** TSK-230, TSK-111, TSK-181


#### TSK-232  ·  5 pts · F   Use case: devolução de venda

**Descrição.** Emite NF-e de devolução referenciando a NF-e original.
**Checklist técnico.** 
- NF-e com finalidade DEVOLUCAO e NFeReferencia
- Estorno de financeiro e estoque
- Tratamento de tributos (recuperação)
**Critérios de aceitação.** 
1. Validação fiscal
**Dependências.** TSK-113


#### TSK-233  ·  8 pts · E2E   Frontend: Pedidos de venda + Faturamento + Devoluções

**Descrição.** Telas completas do módulo de vendas.
**Checklist técnico.** 
- CRUD de pedidos, faturamento com preview, listagem
**Critérios de aceitação.** 
1. UX validada com faturista real
**Dependências.** TSK-231, TSK-232


## EP-20 — Compras


**Resumo. **Pedidos de compra, conferência com nota recebida, gestão de fornecedores.


*Conteúdo: 3 tarefas · Total: 13 pontos*


#### TSK-240  ·  3 pts · B   Modelagem: PurchaseOrder, PurchaseOrderItem

**Descrição.** Entidades de compras.
**Checklist técnico.** 
- Entidades + migrations
**Critérios de aceitação.** 
1. CRUD
**Dependências.** TSK-041


#### TSK-241  ·  5 pts   Use case: ciclo de vida do pedido de compra

**Descrição.** Criar → aprovar → receber (parcial/total) → fechar.
**Checklist técnico.** 
- Aprovação por alçada
- Recebimento parcial atualiza quantidades
- Vínculo com ReceivedDocument na conferência
**Critérios de aceitação.** 
1. Fluxo completo
**Dependências.** TSK-240


#### TSK-242  ·  5 pts · E2E   Frontend: Pedidos de compra

**Descrição.** Telas completas.
**Checklist técnico.** 
- CRUD, aprovação, recebimento, vinculação
**Critérios de aceitação.** 
1. UX validada
**Dependências.** TSK-241


## EP-21 — Financeiro: Contas a Receber, a Pagar, Bancos


**Resumo. **AR, AP, parcelas, conciliação bancária e fluxo de caixa.


*Conteúdo: 6 tarefas · Total: 41 pontos*


#### TSK-250  ·  5 pts · B   Modelagem: AccountReceivable, ReceivableInstallment, AccountPayable, PayableInstallment, BankAccount, BankTransaction

**Descrição.** Entidades financeiras.
**Checklist técnico.** 
- 6 entidades, migrations, repositórios
**Critérios de aceitação.** 
1. CRUD
**Dependências.** TSK-110


#### TSK-251  ·  5 pts   Use case: gerar título a receber/pagar a partir de NF

**Descrição.** Hook automático após autorização de NFe/NFSe e escrituração de ReceivedDocument.
**Checklist técnico.** 
- Receber: AR criado com parcelas conforme cond. pagamento da venda
- Pagar: AP criado com parcelas conforme nota de entrada
- Vínculos: AR.nfeId, AP.receivedDocumentId
**Critérios de aceitação.** 
1. Emitir NFe gera AR; manifestar/escriturar nota recebida gera AP
**Dependências.** TSK-250, TSK-111, TSK-162


#### TSK-252  ·  5 pts   Use case: baixa de título (parcial/total) com juros/multa/desconto

**Descrição.** Operações financeiras com auditoria.
**Checklist técnico.** 
- Baixa parcial atualiza valorAberto, cria BankTransaction quando aplicável
- Cálculo de juros e multa por dia de atraso (configurável)
- Desconto manual com permissão específica
- Estorno de baixa em caso de erro (com auditoria)
**Critérios de aceitação.** 
1. Fluxo completo + auditoria
**Dependências.** TSK-251


#### TSK-253  ·  8 pts   Conciliação bancária por OFX/CNAB

**Descrição.** Importação de extrato e matching automático com baixas previstas.
**Checklist técnico.** 
- Parser OFX (lib ofx-parser-js ou similar) e CNAB
- Matching automático: valor + data ± 3 dias + descrição
- Tela de revisão para matches manuais
- Marcação de transações conciliadas
**Critérios de aceitação.** 
1. Importar extrato de 100 linhas: > 70% match automático
**Dependências.** TSK-252


#### TSK-254  ·  5 pts   Fluxo de caixa projetado e realizado

**Descrição.** Visualização cronológica de entradas e saídas.
**Checklist técnico.** 
- Realizado: BankTransactions agregadas por dia/categoria
- Projetado: AR + AP com vencimento futuro
- Saldo cumulativo por dia
**Critérios de aceitação.** 
1. Gráfico responsivo no frontend
**Dependências.** TSK-252


#### TSK-255  ·  13 pts · E2E   Frontend: Telas Financeiro completas

**Descrição.** CRUD + conciliação + fluxo de caixa.
**Checklist técnico.** 
- Telas para AR, AP, Bancos, Conciliação, Fluxo de Caixa, com filtros e ações
**Critérios de aceitação.** 
1. UX validada com financeiro real
**Dependências.** TSK-252, TSK-253, TSK-254


## EP-22 — ECONF (Conciliação Financeira) e Preparação ao Split Payment


**Resumo. **Registro do Evento de Conciliação Financeira na SEFAZ, base para a evolução do split payment em 2027.


*Conteúdo: 3 tarefas · Total: 12 pontos*


#### TSK-260  ·  2 pts   Modelagem: EconfEvent

**Descrição.** Entidade para o evento ECONF.
**Checklist técnico.** 
- Entidade + migration + repositório
**Critérios de aceitação.** 
1. CRUD
**Dependências.** TSK-110


#### TSK-261  ·  5 pts · F I   Use case: registrar/cancelar ECONF na SEFAZ

**Descrição.** Evento facultativo registrado após a liquidação financeira.
**Checklist técnico.** 
- Trigger automático após baixa total de AR vinculado a NFe
- Composição do evento + assinatura + transmissão
- Tratamento de cancelamento
**Critérios de aceitação.** 
1. Funciona em homologação
**Dependências.** TSK-260, TSK-113, TSK-252


#### TSK-262  ·  5 pts   Simulador de impacto do split payment no fluxo de caixa

**Descrição.** Tela com cenários de impacto quando o split entrar em vigor.
**Checklist técnico.** 
- Cenário padrão / inteligente / simplificado
- Comparação caixa atual × caixa pós-split
- Identificação de necessidade de capital de giro
**Critérios de aceitação.** 
1. Gerência consegue tomar decisão informada
**Dependências.** TSK-254


## 7. Fase 3 — Migração do Legado Paradox/BDE


Fase de risco alto, executada com a operação real já em produção no novo sistema. Foco em saneamento, reconciliação rigorosa e operação paralela controlada.


## EP-23 — Inventário e ETL do Legado


**Resumo. **Extrair dados do Paradox, sanear, mapear e carregar no novo modelo com reconciliação.


*Conteúdo: 5 tarefas · Total: 31 pontos*


#### TSK-270  ·  5 pts · F   Inventário e dicionário de-para legado → novo

**Descrição.** Mapear cada tabela Paradox para entidades novas; identificar gaps.
**Checklist técnico.** 
- Documentação de cada tabela Paradox com campos, tipos, regras embutidas
- Tabela de mapeamento com transformações necessárias
- Identificação de gaps (dados faltantes que precisam ser estimados ou marcados como tal)
- Aprovação do dicionário por especialista fiscal
**Critérios de aceitação.** 
1. Dicionário completo e revisado


#### TSK-271  ·  5 pts   Extrator do Paradox via ODBC ou export CSV

**Descrição.** Ferramenta de extração que produz CSVs estruturados.
**Checklist técnico.** 
- Conexão ODBC ou export via ferramenta externa para CSV
- Validação de integridade dos arquivos (sem corrupção)
- Tratamento de encoding (ISO-8859-1 → UTF-8)
**Critérios de aceitação.** 
1. Extrai snapshot completo em < 2h
**Dependências.** TSK-270


#### TSK-272  ·  8 pts · F   Pipeline de saneamento de dados

**Descrição.** Limpa, normaliza e valida dados antes da carga.
**Checklist técnico.** 
- Validação por entidade (CNPJ válido, NCM válido, etc.)
- Relatório de inconsistências (com decisão por categoria)
- Deduplicação
- Enriquecimento (busca em fontes oficiais quando possível)
**Critérios de aceitação.** 
1. Taxa de aproveitamento > 95% dos registros
**Dependências.** TSK-271


#### TSK-273  ·  8 pts · I   Carga no novo modelo com reconciliação automatizada

**Descrição.** Carregar dados saneados respeitando integridade referencial.
**Checklist técnico.** 
- Ordem correta: tenant → company → users → cadastros → documentos históricos
- Reconciliação automática: totais por período batem entre legado e novo
- Relatório de diferenças com tolerância configurável
- Idempotente: re-executar não duplica
**Critérios de aceitação.** 
1. Reconciliação 100% para totais financeiros e fiscais do mês de corte
**Dependências.** TSK-272


#### TSK-274  ·  5 pts · F   Operação paralela e plano de corte

**Descrição.** Janela onde legado fica read-only e novo é fonte da verdade.
**Checklist técnico.** 
- Checklist de corte (todos os usuários migrados, certificados ok, treinamento concluído)
- Plano de rollback documentado
- Comunicação aos usuários
- Monitoramento intensivo nas primeiras 2 semanas
**Critérios de aceitação.** 
1. Corte executado sem incidente crítico
**Dependências.** TSK-273


## 8. Fase 4 — Conformidade Contínua 2027+


Fase recorrente que acompanha o cronograma da Reforma Tributária. Detalhamento referencial; cada ano é re-planejado conforme normas vigentes.


## EP-24 — Conformidade 2027: CBS plena, fim de PIS/COFINS, Simples/MEI obrigatório


**Resumo. **Transição do regime simbólico (2026) para apuração efetiva.


*Conteúdo: 3 tarefas · Total: 16 pontos*


#### TSK-280  ·  5 pts · F   Ativar cálculo efetivo de CBS e desativar PIS/COFINS

**Descrição.** Mudança de vigência nos parâmetros tributários.
**Checklist técnico.** 
- Vigência: 2027-01-01
- Calculadora CBS no modo pleno
- PIS/COFINS pulam (já implementado)
- Apuração mensal inclui CBS
**Critérios de aceitação.** 
1. Apuração CBS funciona; PIS/COFINS desabilitados
**Dependências.** TSK-068


#### TSK-281  ·  3 pts · F   Ativar Imposto Seletivo

**Descrição.** IS começa em 2027.
**Checklist técnico.** 
- Vigência do parâmetro IS em 2027
**Critérios de aceitação.** 
1. IS aparece em notas de produtos sujeitos
**Dependências.** TSK-069


#### TSK-282  ·  8 pts · F   Suporte completo a Simples Nacional/MEI (CRT 1, 2, 4)

**Descrição.** Ampliar emissão para empresas do Simples e MEI.
**Checklist técnico.** 
- Calculadoras adaptam tratamento (CSOSN, sem ICMS próprio destacado, etc.)
- NFS-e Nacional obrigatória para MEI
- Testes com empresas de cada CRT
**Critérios de aceitação.** 
1. Emissão funciona para todos os CRTs
**Dependências.** TSK-280


## EP-25 — Split Payment (RT 2026.001)


**Resumo. **Integração com PSPs para execução automática conforme regulamentação.


*Conteúdo: 2 tarefas · Total: 18 pontos*


#### TSK-290  ·  5 pts   Modelagem: vinculação DF-e × transação de pagamento

**Descrição.** Conforme NT RT 2026.001.
**Checklist técnico.** 
- Entidade específica + relação com NFe e BankTransaction
**Critérios de aceitação.** 
1. Modelo aprovado por fiscal


#### TSK-291  ·  13 pts · I   Adapter para PSP (provedor a definir)

**Descrição.** Integração com adquirente para split automático.
**Checklist técnico.** 
- Integração API do PSP escolhido
- Idempotência
- Reconciliação automática
**Critérios de aceitação.** 
1. Split executado fim a fim em ambiente de teste
**Dependências.** TSK-290


## EP-26 — Transição 2029-2032: IBS crescente, ICMS/ISS decrescente


**Resumo. **Operação proporcional dos dois regimes durante a substituição gradual.


*Conteúdo: 1 tarefas · Total: 5 pontos*


#### TSK-300  ·  5 pts · F   Cálculo proporcional por vigência anual

**Descrição.** Ajustar parâmetros anualmente conforme cronograma.
**Checklist técnico.** 
- Vigências anuais 2029, 2030, 2031, 2032 com proporção crescente IBS
- Validação fiscal de cada vigência
**Critérios de aceitação.** 
1. Cálculo bate com tabelas oficiais
**Dependências.** TSK-280


## EP-27 — Consolidação 2033: IVA Dual pleno


**Resumo. **Desativar tributos antigos; manter apenas histórico.


*Conteúdo: 1 tarefas · Total: 3 pontos*


#### TSK-310  ·  3 pts · F   Desabilitar cálculos de ICMS/ISS/IPI

**Descrição.** Por vigência, calculadoras antigas pulam.
**Checklist técnico.** 
- Vigência 2033-01-01
**Critérios de aceitação.** 
1. Apenas IBS/CBS/IS calculados
**Dependências.** TSK-300


## 9. Anexos


### 9.1 Convenções de código

- TypeScript strict; sem any sem justificativa em comentário.
- Imports: absolutos via paths aliases (@domain, @application, @infrastructure, @presentation, @shared).
- Naming: PascalCase para classes/interfaces (com prefixo I para interfaces de domínio); camelCase para funções/variáveis; kebab-case para arquivos.
- Use cases nomeados no infinitivo (EmitirNFeUseCase, CancelarNFeUseCase).
- Commits seguem Conventional Commits.
- ADRs (Architecture Decision Records) em docs/adr/ com numeração sequencial.

### 9.2 Estratégia de testes


| Tipo | Onde | Cobertura alvo | Frequência |
| --- | --- | --- | --- |
| Unit | Domain + Application (use cases puros) | ≥ 90% | Cada PR |
| Integration | Infrastructure (repositórios, adapters externos com mocks de rede) | ≥ 80% | Cada PR |
| E2E | Presentation → Database (com Postgres real via testcontainers) | Fluxos críticos do PRD | Cada PR + nightly |
| Contract | SEFAZ/Focus (com fixtures de XML/JSON oficiais) | Endpoints usados | Semanal + on-demand |
| Load | Cenários de pico (1000 emissões/min) | Antes de cada release maior | Pre-release |


### 9.3 Critérios de pronto para produção (Go-Live MVP)

1. Todos os épicos das Fases 0, 1a, 1b, 1c concluídos.
1. Cobertura de testes ≥ 80% global; ≥ 90% nos use cases.
1. Auditoria de segurança independente realizada (foco em custódia de certificado, RBAC e dados sensíveis).
1. Load test simulando 2× o pico esperado passa sem degradação > 20%.
1. Plano de disaster recovery documentado e testado (RPO ≤ 15min, RTO ≤ 4h).
1. Pelo menos 3 empresas em homologação por 30 dias sem incidentes críticos.
1. Treinamento de pelo menos 1 usuário-chave por empresa cliente.
1. Documentação técnica completa: arquitetura, runbooks, API (OpenAPI), guia de onboarding.
1. Plano de suporte definido: SLAs, escalonamento, on-call.
1. Aprovação formal do patrocinador e do responsável fiscal/contábil.

### 9.4 Estimativa consolidada


| Fase | Épicos | Tarefas | Pontos |
| --- | --- | --- | --- |
| Fase 0 | EP-01 a EP-05 | ~25 | ~200 |
| Fase 1a | EP-06 a EP-09 | ~20 | ~265 |
| Fase 1b | EP-10 a EP-14 | ~17 | ~165 |
| Fase 1c | EP-15 a EP-18 | ~16 | ~125 |
| Fase 2 | EP-19 a EP-22 | ~17 | ~225 |
| Fase 3 | EP-23 | ~5 | ~140 |
| Fase 4 | EP-24 a EP-27 | ~7 (referencial) | ~200/ano |
| TOTAL MVP (Fases 0-1c) | ~14 épicos | ~78 tarefas | ~755 pontos |
| TOTAL ATÉ FASE 3 | ~20 épicos | ~100 tarefas | ~1120 pontos |


**Próximos passos imediatos: **(1) revisar este plano com a equipe técnica e ajustar estimativas conforme calibração; (2) executar refinamento detalhado da Sprint 1 (~7 a 8 tarefas da Fase 0); (3) configurar ferramenta de gestão (Linear, Jira ou equivalente) com a estrutura de épicos e tarefas; (4) definir cerimônias ágeis (planning quinzenal, daily 15min, review/retro a cada sprint); (5) iniciar Sprint 1 com a fundação (TSK-001 a TSK-009).

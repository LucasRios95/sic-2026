# Deploy no Railway (acesso web)

Runbook para publicar o SIC NF-e no Railway. Decisões adotadas:
- **Serviço único**: um `Dockerfile` na RAIZ builda o frontend e o embute no backend; o **backend (Node) serve a API + o SPA numa porta só**. No Railway = **1 serviço de app + Postgres + Redis** (2 plugins). *(Implementado: `Dockerfile` + `railway.json` na raiz; o backend serve `/app/public` quando `SERVE_FRONTEND_DIR` está setado — validado localmente.)*
- **Vault de certificados**: `VAULT_DRIVER=db` (cofre A1 cifrado AES-256-GCM no Postgres) — sem volume, sobrevive a deploys.
- **mTLS SEFAZ**: bundle ICP-Brasil embarcado em `backend/certs/icp-brasil.pem`.
- **Finalidade**: produção real do cliente.

> ⚠️ Railway cobra por uso. Sistema fiscal exposto na internet — use segredos fortes e troque a senha do admin no 1º login.

## Arquitetura (serviço único)

| Componente | Como |
|---|---|
| **app** | 1 serviço do repo, **Root Directory = raiz (vazio)**, builder Dockerfile (raiz). Serve API + SPA. **Tem domínio público.** |
| Postgres | **Plugin gerenciado** (Add → Database → PostgreSQL) |
| Redis | **Plugin gerenciado** (Add → Database → Redis) |

O `railway.json` da raiz já define builder Dockerfile, **Pre-Deploy** (migrations + seed) e healthcheck `/health`. O worker (filas) é **opcional** — fica para depois.

## Passo a passo (serviço único)
1. **New Project → Deploy from GitHub repo** → `sic-2026` (o serviço aponta para a **raiz**, sem Root Directory).
2. **Add → Database → PostgreSQL** e **Add → Database → Redis**.
3. No serviço do app, **Variables**: cole o bloco de env de baixo (seção "Variáveis"), com 2 detalhes:
   - **NÃO** setar `PORT` (o Railway injeta a porta pública; o app escuta nela).
   - `CORS_ALLOWED_ORIGINS` = o **domínio público deste serviço** (preencha após gerar o domínio).
   - Pode **ignorar** `BACKEND_UPSTREAM`/`NGINX_RESOLVER` (são só do modo multi-serviço/nginx).
4. **Settings → Networking → Generate Domain** → esse é o endereço de acesso.
5. **Restaurar o dump** no Postgres do Railway (ver seção "Restaurar os dados").
6. **Reenviar o PFX** em Administração → Certificados (vault `db` começa vazio).
7. Login `admin@sic.local / Admin@123` → **trocar a senha**.

> Se o build falhar com "Railpack could not determine how to build" → o serviço está sem o `railway.json`/Dockerfile no Root. Garanta que o **Root Directory está vazio (raiz)** — lá estão o `Dockerfile` e o `railway.json`.

## Mudanças no repositório

Já aplicadas:
- `frontend/nginx.conf` virou **template** (`${BACKEND_UPSTREAM}`, `${NGINX_RESOLVER}`, `${NGINX_RESOLVER_OPTS}`) — o `Dockerfile.prod` do frontend copia para `/etc/nginx/templates/` e o envsubst do nginx renderiza no boot. Defaults reproduzem o comportamento local; no Railway sobrescrevemos por env.
- `backend/railway.json` e `frontend/railway.json` já apontam o builder para `Dockerfile.prod` — o Railway seleciona automaticamente (não precisa setar "Dockerfile Path" no painel).
- **Bundle ICP-Brasil embarcado** em `backend/certs/icp-brasil.pem` (vai na imagem via `COPY . .`) → `NFE_TLS_CA_BUNDLE=/app/certs/icp-brasil.pem` funciona para mTLS de produção. Para atualizar quando as ACs rotacionarem: `scripts/download-icp-brasil.ps1` + commit + redeploy.

Nada mais de código é obrigatório.

## (Alternativa) Multi-serviço

> Só use se quiser backend/worker/frontend separados (escala independente). O caminho padrão é o **serviço único** acima.

### 1. Projeto + repo
1. Suba o repositório para o GitHub (o Railway builda a partir dele).
2. Railway → **New Project** → **Deploy from GitHub repo** → selecione o repo.

### 2. Bancos gerenciados
3. **Add → Database → PostgreSQL**.
4. **Add → Database → Redis**.
   - Eles expõem variáveis (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `REDIS_*`/`REDISHOST`…). Usaremos via *reference variables* (`${{Postgres.PGHOST}}` etc.).

### 3. Serviço `backend`
5. New Service → from repo. Settings:
   - **Root Directory**: `backend`
   - **Builder**: Dockerfile → `Dockerfile.prod`
   - **Pre-Deploy Command** (roda migrations — incl. a tabela do cofre `certificate_vault_entries` — + seed):
     ```
     npx tsx ./node_modules/typeorm/cli.js -d src/shared/infra/typeorm/data-source.ts migration:run && npx tsx src/shared/infra/typeorm/seeds/run-seeds.ts
     ```
   - **Volume**: **opcional** com `VAULT_DRIVER=db` (o cofre vive no Postgres). Útil só se quiser persistir PDFs/XMLs gerados em `/app/tmp/docs` entre deploys — mas o XML autorizado já fica no banco e os PDFs são regeneráveis, então pode dispensar no MVP.
6. Variáveis (aba Variables) — ver tabela abaixo. Use referências aos plugins para `DB_*`/`REDIS_*`.
7. **Não** exponha domínio público no backend (fica só na rede privada).

### 4. Serviço `worker`
8. New Service → from o **mesmo repo**. Settings:
   - **Root Directory**: `backend`, **Dockerfile**: `Dockerfile.prod`
   - **Custom Start Command**: `npx tsx src/shared/infra/queues/worker.ts`
   - Mesmas variáveis do backend (copie, incl. `VAULT_DRIVER=db` e `VAULT_MASTER_KEY`). **Sem** Pre-Deploy, **sem** domínio público.
   - ✅ Com `VAULT_DRIVER=db` o worker **acessa o mesmo cofre** (via Postgres) — fluxos assíncronos que precisem do A1 (reconciliação/transmissão) funcionam.

### 5. Serviço `frontend`
9. New Service → mesmo repo. Settings:
   - **Root Directory**: `frontend`, **Dockerfile**: `Dockerfile.prod`
   - **Build Arg**: `VITE_API_BASE_URL=/api` (default; mantém same-origin via proxy)
   - Variáveis de runtime do nginx:
     - `BACKEND_UPSTREAM=backend.railway.internal:3333`
     - `NGINX_RESOLVER=` → **DNS interno do Railway** (rede privada é IPv6; confirmar o endereço do resolver na doc do Railway no 1º deploy)
     - `NGINX_RESOLVER_OPTS=` (vazio → IPv6 habilitado)
   - **Gere um domínio público** (Settings → Networking → Generate Domain). Esse é o endereço que o cliente acessa.
10. Habilite **Private Networking** no projeto (geralmente on por padrão) para `backend.railway.internal` resolver.

### 6. CORS
11. No backend, `CORS_ALLOWED_ORIGINS` = a URL pública do frontend (ex.: `https://sic-frontend-production.up.railway.app`). Como o front é same-origin (`/api` via nginx), o CORS quase não é exercido, mas mantenha coerente.

### 7. Restaurar os dados (uma vez)
12. Pegue a string de conexão do Postgres do Railway (Connect → Postgres Connection URL).
13. Restaure o dump que já geramos (`releases/sic-2026-*/db/sic_2026.dump` ou regenere):
    ```
    pg_restore --clean --if-exists --no-owner --no-acl -d "<RAILWAY_POSTGRES_URL>" sic_2026.dump
    ```
    Rode da sua máquina (precisa do `pg_restore` do Postgres 16). Faça isso **após** o 1º deploy (para o schema/seed já existirem) — o `--clean` cuida da reconciliação.
14. **Certificado A1 no driver `db`**: o dump traz a linha em `certificates`, mas o `vault_ref` antigo é `fs:…` (cofre filesystem do dev) — o driver `db` procura `db:…` no Postgres e **não acha**. Então, após o 1º deploy, **reenvie o PFX** em **Administração → Certificados** (gera um `db:…` novo na tabela `certificate_vault_entries`). Use a **mesma `VAULT_MASTER_KEY`** do `.env` local. *(Alternativa avançada: script único que lê o cofre filesystem e regrava no banco atualizando `certificates.vault_ref` — não incluído.)*

## Variáveis de ambiente (copia e cola por serviço)

Gere os 2 segredos primeiro:
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # rode 2x: JWT_SECRET e VAULT_MASTER_KEY
```
> ⚠️ Defina a `VAULT_MASTER_KEY` **uma vez e nunca troque** (mudar torna os certificados ilegíveis). No Railway pode ser uma chave nova — você vai reenviar o PFX.

### Backend **e** Worker (as MESMAS variáveis nos dois serviços)
```
# Conexão — UMA referência por plugin (recomendado: simples e à prova de erro de digitação)
# Use a *private URL* (rede interna do Railway, sem custo de egress e mais rápida).
# Se o plugin não expuser a *_PRIVATE_URL, troque por ${{Postgres.DATABASE_URL}} / ${{Redis.REDIS_URL}}.
DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}
REDIS_URL=${{Redis.REDIS_PRIVATE_URL}}

# ── Alternativa (variáveis discretas) ──────────────────────────────────────────
# Se preferir, NÃO defina DATABASE_URL/REDIS_URL e use as 8 abaixo no lugar:
# DB_HOST=${{Postgres.PGHOST}}
# DB_PORT=${{Postgres.PGPORT}}
# DB_USER=${{Postgres.PGUSER}}
# DB_PASS=${{Postgres.PGPASSWORD}}
# DB_NAME=${{Postgres.PGDATABASE}}
# REDIS_HOST=${{Redis.REDISHOST}}
# REDIS_PORT=${{Redis.REDISPORT}}
# REDIS_PASSWORD=${{Redis.REDISPASSWORD}}

# Segredos (você gera)
JWT_SECRET=<cole o aleatório gerado>
VAULT_MASTER_KEY=<cole o aleatório gerado>

# Configuração fixa
NODE_ENV=production
PORT=3333
DB_SCHEMA=public
DB_SYNCHRONIZE=false
DB_LOGGING=false
QUEUE_PREFIX=sic2026
VAULT_DRIVER=db
STORAGE_DRIVER=filesystem
STORAGE_PATH=/app/tmp/docs
CORS_ALLOWED_ORIGINS=https://<seu-frontend>.up.railway.app

# mTLS SEFAZ — bundle ICP-Brasil JÁ embarcado na imagem (backend/certs/icp-brasil.pem)
NFE_TLS_CA_BUNDLE=/app/certs/icp-brasil.pem

# Opcionais
LOG_LEVEL=info
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
BCRYPT_COST=12
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_DURATION_MINUTES=15
MAIL_HOST=
```

### Frontend
```
# Build Arg (seção Build do serviço)
VITE_API_BASE_URL=/api

# Runtime (env do serviço)
BACKEND_UPSTREAM=backend.railway.internal:3333
NGINX_RESOLVER=<DNS interno IPv6 do Railway — confirmar no 1º deploy>
NGINX_RESOLVER_OPTS=
```

> Notas:
> - `REDIS_PASSWORD`: só se o plugin expuser; senão omita.
> - `CORS_ALLOWED_ORIGINS` e o domínio do frontend você só sabe depois de **Generate Domain** — preencha e faça um redeploy.
> - `NGINX_RESOLVER_OPTS` vazio = IPv6 ligado (rede privada do Railway é IPv6).

## Verificação
1. Backend: deploy verde + logs "Servidor sic-2026-backend ouvindo".
2. Frontend: abrir a URL pública → tela de login.
3. Login `admin@sic.local / Admin@123` → **trocar a senha**.
4. Conferir que os dados (DCLASS, produtos, usuários) apareceram após o `pg_restore`.
5. Emitir uma NF-e de homologação para validar o caminho síncrono + certificado.

## Pontos a confirmar no 1º deploy
- **Resolver do nginx no Railway** (`NGINX_RESOLVER`): a rede privada é IPv6; ajuste o endereço do resolver conforme a doc atual do Railway. Se o front der 502 em `/api`, é quase sempre isso.
- **Porta do backend na rede privada**: o frontend aponta para `backend.railway.internal:3333`; garanta que o backend escuta em `3333` (`PORT=3333`).
- **ICP-Brasil bundle**: já embarcado em `backend/certs/icp-brasil.pem` (na imagem). Só confirme que `NFE_TLS_CA_BUNDLE=/app/certs/icp-brasil.pem` está setado no backend/worker. Atualizar quando as ACs rotacionarem: `scripts/download-icp-brasil.ps1` + commit + redeploy.

## Evolução
- ✅ **Vault no banco** (`VAULT_DRIVER=db`) — **implementado**: `PostgresCertificateVault` + migration `certificate_vault_entries`. Elimina a dependência de volume e dá ao worker acesso ao certificado.
- Pendente de validação (Docker): rodar a migration, teste de round-trip do `vaultCrypto`, e reupload do PFX no ambiente Railway.

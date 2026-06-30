# syntax=docker/dockerfile:1.7
# =============================================================================
# Imagem ÚNICA para o Railway (serviço único).
#
# Builda o frontend (Vite) e embute o resultado no backend; o backend (Node/tsx)
# serve a API E o SPA numa única porta (env PORT, que o Railway define). Assim o
# deploy no Railway fica em UM serviço de app — Postgres e Redis continuam como
# plugins gerenciados (não cabem aqui).
#
# Contexto de build = RAIZ do repositório (backend/ e frontend/ são subpastas).
# Dev e on-premise NÃO usam este arquivo (continuam com os Dockerfile.prod + nginx).
# =============================================================================

# --- Stage 1: build do frontend -> /fe/dist ---
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --legacy-peer-deps; fi
COPY frontend/ ./
# Same-origin: o SPA chama /api/* e o backend (mesmo serviço) atende.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npx vite build

# --- Stage 2: backend (Node) + estáticos do frontend ---
FROM node:22-alpine
ARG RAILWAY_GIT_COMMIT_SHA=unknown
ARG RAILWAY_SERVICE_NAME=unknown
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
ENV APP_BUILD_SHA=${RAILWAY_GIT_COMMIT_SHA}
ENV APP_BUILD_SOURCE=${RAILWAY_SERVICE_NAME}
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

COPY backend/package.json backend/package-lock.json* ./
# build-base + python3: toolchain p/ node-gyp compilar o libxmljs2 (validação XSD).
# Virtual package removido após o install — o .node compilado persiste.
RUN apk add --no-cache --virtual .build-deps build-base python3 && \
    (if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev --legacy-peer-deps; fi) && \
    apk del .build-deps

COPY backend/ ./
# Build estático do frontend embutido; o backend o serve via SERVE_FRONTEND_DIR.
COPY --from=frontend /fe/dist ./public
ENV SERVE_FRONTEND_DIR=/app/public

RUN mkdir -p /app/tmp/vault /app/tmp/docs && \
    addgroup -S app && adduser -S app -G app && \
    chown -R app:app /app
USER app

EXPOSE 3333
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/shared/infra/http/server.ts"]

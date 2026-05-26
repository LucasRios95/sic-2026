# =============================================================================
# build-release.ps1 -- empacota uma release pra instalar no cliente.
#
# Nota: script em ASCII puro porque o PowerShell 5.1 do Windows interpreta
# arquivos UTF-8 sem BOM como CP1252 e mojibake quebra o parser.
#
# O que faz:
#  1. Constroi as imagens de producao (backend + frontend) via Dockerfile.prod
#  2. Exporta as imagens como tarballs (docker save)
#  3. Faz dump do Postgres atual (banco do dev, com DCLASS importada)
#  4. Copia os scripts/configs de instalacao
#  5. Empacota tudo num unico ZIP para enviar ao cliente
#
# Pre-requisitos:
#  - Docker Desktop rodando
#  - Stack atual com sic_2026_postgres ativo
#
# Uso:
#   .\scripts\build-release.ps1
#   .\scripts\build-release.ps1 -SkipBuild
#   .\scripts\build-release.ps1 -SkipDb
# =============================================================================

[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipDb
)

$ErrorActionPreference = 'Stop'

# Wrapper para chamar executaveis nativos sem que stderr (progresso do docker)
# seja interpretado como erro fatal -- comportamento padrao do PS 5.1 quando
# ErrorActionPreference=Stop.
function Invoke-Native {
    param([Parameter(Mandatory)][scriptblock]$Block, [string]$Action = 'comando')
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Block
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    if ($code -ne 0) { throw "Falha no $Action (exit $code)" }
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$releaseName = "sic-2026-$timestamp"
$releasesDir = Join-Path $root 'releases'
$stageDir = Join-Path $releasesDir $releaseName
$zipPath = "$stageDir.zip"

Write-Host '================================================' -ForegroundColor Cyan
Write-Host "Empacotando release: $releaseName" -ForegroundColor Cyan
Write-Host '================================================' -ForegroundColor Cyan

# --- 0. Limpa staging antigo ---
if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir 'images') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir 'db') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir 'certs') | Out-Null

# --- 1. Build das imagens de producao ---
if (-not $SkipBuild) {
    Write-Host "`n[1/4] Construindo imagem sic-2026-backend:prod..." -ForegroundColor Yellow
    $backendDockerfile = Join-Path $root 'backend/Dockerfile.prod'
    $backendCtx = Join-Path $root 'backend'
    Invoke-Native -Action 'build do backend' -Block {
        & docker build -f $backendDockerfile -t sic-2026-backend:prod $backendCtx
    }

    Write-Host "`n[1/4] Construindo imagem sic-2026-frontend:prod..." -ForegroundColor Yellow
    $frontendDockerfile = Join-Path $root 'frontend/Dockerfile.prod'
    $frontendCtx = Join-Path $root 'frontend'
    Invoke-Native -Action 'build do frontend' -Block {
        & docker build -f $frontendDockerfile -t sic-2026-frontend:prod $frontendCtx
    }
} else {
    Write-Host "`n[1/4] Pulando build -- usando imagens existentes" -ForegroundColor Yellow
}

# --- 2. Salva imagens como tarballs ---
Write-Host "`n[2/4] Exportando imagens para tar..." -ForegroundColor Yellow
$backendTar = Join-Path $stageDir 'images/sic-2026-backend.tar'
$frontendTar = Join-Path $stageDir 'images/sic-2026-frontend.tar'

Invoke-Native -Action 'docker save backend' -Block { & docker save -o $backendTar sic-2026-backend:prod }
Invoke-Native -Action 'docker save frontend' -Block { & docker save -o $frontendTar sic-2026-frontend:prod }

Write-Host ('  backend.tar  : {0} MB' -f [math]::Round((Get-Item $backendTar).Length / 1MB, 1))
Write-Host ('  frontend.tar : {0} MB' -f [math]::Round((Get-Item $frontendTar).Length / 1MB, 1))

# --- 3. Dump do Postgres ---
if (-not $SkipDb) {
    Write-Host "`n[3/4] Fazendo dump do banco atual..." -ForegroundColor Yellow
    $dumpPath = Join-Path $stageDir 'db/sic_2026.dump'

    # pg_dump em formato custom (.dump). --no-owner/--no-acl: usuario no cliente pode ser outro.
    Invoke-Native -Action 'pg_dump' -Block {
        & docker exec sic_2026_postgres pg_dump -U postgres -d sic_2026 --format=custom --no-owner --no-acl --file=/tmp/sic_2026.dump
    }
    Invoke-Native -Action 'docker cp do dump' -Block {
        & docker cp sic_2026_postgres:/tmp/sic_2026.dump $dumpPath
    }
    & docker exec sic_2026_postgres rm /tmp/sic_2026.dump 2>$null | Out-Null

    Write-Host ('  sic_2026.dump : {0} MB' -f [math]::Round((Get-Item $dumpPath).Length / 1MB, 1))

    # Tambem salva o volume do vault (certificados A1 criptografados).
    Write-Host '  Exportando vault de certificados...' -ForegroundColor Yellow
    $vaultTar = Join-Path $stageDir 'db/vault-data.tar'

    $stageDirUnix = ($stageDir -replace '\\', '/')
    try {
        Invoke-Native -Action 'export do vault' -Block {
            & docker run --rm -v sic-2026_sic_2026_backend_tmp:/data:ro -v "$stageDirUnix/db:/backup" alpine:3 tar -cf /backup/vault-data.tar -C /data .
        }
        Write-Host ('  vault-data.tar : {0} KB' -f [math]::Round((Get-Item $vaultTar).Length / 1KB, 1))
    } catch {
        Write-Warning 'Falha ao exportar vault -- cliente vai precisar fazer upload do PFX manualmente'
    }
} else {
    Write-Host "`n[3/4] Pulando dump do DB" -ForegroundColor Yellow
}

# --- 4. Copia arquivos de configuracao e scripts ---
Write-Host "`n[4/4] Copiando configuracoes..." -ForegroundColor Yellow

Copy-Item -Path (Join-Path $root 'docker-compose.prod.yml') -Destination $stageDir
Copy-Item -Path (Join-Path $root 'scripts/install.ps1') -Destination $stageDir
Copy-Item -Path (Join-Path $root 'scripts/download-icp-brasil.ps1') -Destination $stageDir
Copy-Item -Path (Join-Path $root 'INSTALL.md') -Destination $stageDir

# .env.example da release
$envExample = @'
# .env do servidor -- gerado automaticamente por install.ps1.
# NAO edite manualmente exceto se souber o que esta fazendo.

# Banco de dados (interno; conexao so via rede Docker)
DB_USER=postgres
DB_PASS=__GERAR_NO_INSTALL__
DB_NAME=sic_2026
DB_PORT=5432

# Autenticacao
JWT_SECRET=__GERAR_NO_INSTALL__

# Cofre de certificados -- chave que descriptografa o A1.
# IMPORTANTE: esta chave veio da release. Se for trocada, o cofre se torna ilegivel.
VAULT_MASTER_KEY=__USAR_DA_RELEASE__

# Frontend
FRONTEND_PORT=8080
CORS_ALLOWED_ORIGINS=http://localhost:8080

# E-mail (opcional)
MAIL_HOST=

# Cadeia ICP-Brasil (opcional em homologacao; obrigatorio em producao SEFAZ)
NFE_TLS_CA_BUNDLE=
'@
Set-Content -Path (Join-Path $stageDir '.env.example') -Value $envExample -Encoding UTF8

# Vault master key da instalacao atual
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
    $vaultLine = Get-Content $envFile | Select-String '^VAULT_MASTER_KEY=' | Select-Object -First 1
    if ($vaultLine) {
        $vaultKey = $vaultLine.ToString() -replace '^VAULT_MASTER_KEY=', ''
        if ($vaultKey) {
            Set-Content -Path (Join-Path $stageDir 'db/.vault-master-key') -Value $vaultKey -NoNewline -Encoding UTF8
            Write-Host '  vault master key incluida pra preservar certificados existentes' -ForegroundColor Green
        }
    }
}

# --- 5. Empacota em ZIP ---
Write-Host "`nEmpacotando em ZIP..." -ForegroundColor Yellow
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath -CompressionLevel Fastest

$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "Release pronta: $zipPath" -ForegroundColor Green
Write-Host ('Tamanho: {0} MB' -f $zipSize) -ForegroundColor Green
Write-Host '================================================' -ForegroundColor Green
Write-Host "`nProximos passos:" -ForegroundColor Cyan
Write-Host '  1. Envie o ZIP para o cliente (drive/pen-drive/wetransfer)'
Write-Host '  2. No PC do cliente: descompacte, abra PowerShell na pasta extraida'
Write-Host '  3. Rode .\install.ps1 (precisa Docker Desktop instalado)'

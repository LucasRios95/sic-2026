# =============================================================================
# install.ps1 -- instala o SIC NF-e numa maquina cliente.
#
# Nota: script em ASCII puro (PowerShell 5.1 do Windows quebra com acentos
# em arquivos UTF-8 sem BOM).
#
# Pressupostos:
#  - Docker Desktop instalado e rodando
#  - Pasta atual contem os arquivos da release (images/, db/, docker-compose.prod.yml)
#  - PowerShell 5.1+ (Windows 10/11)
#
# O que faz:
#  1. Verifica Docker
#  2. Carrega as imagens dos tar (docker load)
#  3. Gera .env com novos JWT_SECRET + DB_PASS
#     e preserva o VAULT_MASTER_KEY da release
#  4. Sobe o stack via compose
#  5. Restaura o dump do banco
#  6. Restaura o volume do vault (certificados)
#  7. Cria atalho na area de trabalho
#
# Uso:
#   .\install.ps1
#   .\install.ps1 -InstallPath D:\sic-nfe
#   .\install.ps1 -Reinstall
# =============================================================================

[CmdletBinding()]
param(
    [string]$InstallPath = (Join-Path $env:USERPROFILE 'sic-nfe'),
    [switch]$Reinstall
)

$ErrorActionPreference = 'Stop'

# Log em arquivo na pasta da release — sempre, para diagnostico mesmo se a janela do
# PS fechar (comportamento padrao do "Executar com PowerShell" via clique direito).
$logFile = Join-Path $PSScriptRoot 'install.log'
try {
    if (Test-Path $logFile) { Remove-Item -Force $logFile -ErrorAction SilentlyContinue }
    Start-Transcript -Path $logFile -Force | Out-Null
} catch {
    # Se transcript ja estava ativo (re-run), ignora.
}

# Pausa no fim — sempre — pra usuario ler antes da janela fechar.
function Wait-Exit($exitCode) {
    Write-Host ''
    if ($exitCode -eq 0) {
        Write-Host 'Pressione ENTER para fechar...' -ForegroundColor Green
    } else {
        Write-Host "Erro na instalacao (codigo $exitCode). Log salvo em:" -ForegroundColor Red
        Write-Host "  $logFile" -ForegroundColor Yellow
        Write-Host 'Envie esse arquivo para suporte.' -ForegroundColor Yellow
        Write-Host ''
        Write-Host 'Pressione ENTER para fechar...' -ForegroundColor Red
    }
    try { Read-Host | Out-Null } catch {}
    try { Stop-Transcript | Out-Null } catch {}
    exit $exitCode
}

# Wrapper para chamar executaveis nativos. No PS 5.1 com ErrorActionPreference=Stop,
# qualquer linha em stderr (progresso de docker, p.ex.) eh tratada como erro fatal.
# Isolamos as chamadas e olhamos apenas $LASTEXITCODE.
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

function Write-Step($msg) {
    Write-Host "`n>>> $msg" -ForegroundColor Cyan
}

function Test-DockerReady {
    try {
        docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

# A partir daqui o corpo principal e envolvido em try/catch para que qualquer
# excecao seja capturada, exibida e logada antes da janela do PS fechar.
try {

# --- 0. Verifica Docker ---
Write-Step 'Verificando Docker Desktop...'
if (-not (Test-DockerReady)) {
    Write-Host 'ERRO: Docker nao esta rodando.' -ForegroundColor Red
    Write-Host '      Instale o Docker Desktop em https://www.docker.com/products/docker-desktop/'
    Write-Host '      Depois abra o Docker Desktop e espere o icone ficar verde.'
    exit 1
}
Write-Host 'Docker OK.' -ForegroundColor Green

# --- 1. Pasta de instalacao ---
$releaseDir = $PSScriptRoot
if (-not $releaseDir) { $releaseDir = (Get-Location).Path }

Write-Step "Pasta de instalacao: $InstallPath"
if (Test-Path $InstallPath) {
    if ($Reinstall) {
        Write-Host 'Apagando instalacao anterior...' -ForegroundColor Yellow
        Push-Location $InstallPath
        try {
            docker compose -f docker-compose.prod.yml down -v 2>$null
        } catch {}
        Pop-Location
        Remove-Item -Recurse -Force $InstallPath
    } else {
        Write-Host 'Pasta ja existe. Use -Reinstall para sobrescrever.' -ForegroundColor Yellow
        exit 1
    }
}
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallPath 'certs') | Out-Null

Copy-Item -Path (Join-Path $releaseDir 'docker-compose.prod.yml') -Destination $InstallPath

# --- 2. Carrega imagens ---
Write-Step 'Carregando imagens Docker...'
$backendTar = Join-Path $releaseDir 'images/sic-2026-backend.tar'
$frontendTar = Join-Path $releaseDir 'images/sic-2026-frontend.tar'

if (-not (Test-Path $backendTar)) {
    Write-Host "ERRO: imagem backend nao encontrada em $backendTar" -ForegroundColor Red
    exit 1
}
Invoke-Native -Action 'docker load backend' -Block { & docker load -i $backendTar }
Invoke-Native -Action 'docker load frontend' -Block { & docker load -i $frontendTar }

# --- 3. Gera .env ---
Write-Step 'Gerando .env com novos segredos...'

function New-RandomBase64($bytes) {
    $buf = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return [Convert]::ToBase64String($buf)
}

$jwtSecret = New-RandomBase64 24
$dbPass = New-RandomBase64 12

# Vault master key
$vaultKeyPath = Join-Path $releaseDir 'db/.vault-master-key'
if (Test-Path $vaultKeyPath) {
    $vaultKey = (Get-Content -Raw $vaultKeyPath).Trim()
    Write-Host 'Vault master key preservada da release (mantem certificados existentes)' -ForegroundColor Green
} else {
    $vaultKey = New-RandomBase64 32
    Write-Host 'Gerada nova vault master key -- cliente precisara reenviar PFX' -ForegroundColor Yellow
}

$envContent = @"
# Gerado automaticamente por install.ps1.
DB_USER=postgres
DB_PASS=$dbPass
DB_NAME=sic_2026
DB_PORT=5432

JWT_SECRET=$jwtSecret

VAULT_MASTER_KEY=$vaultKey

FRONTEND_PORT=8080
CORS_ALLOWED_ORIGINS=http://localhost:8080

NODE_ENV=production
LOG_LEVEL=info

MAIL_HOST=
NFE_TLS_CA_BUNDLE=
"@
Set-Content -Path (Join-Path $InstallPath '.env') -Value $envContent -Encoding UTF8

# --- 4. Sobe stack ---
Push-Location $InstallPath
try {
    Write-Step 'Subindo containers (primeira vez pode demorar)...'
    Invoke-Native -Action 'docker compose up' -Block {
        & docker compose -f docker-compose.prod.yml up -d
    }

    # Resolve container IDs via compose -- removemos container_name fixo para
    # evitar conflito quando o cliente reinstala ou tem outra stack na maquina.
    function Get-ServiceContainer($service) {
        return & docker compose -f docker-compose.prod.yml ps -q $service 2>$null | Select-Object -First 1
    }

    Write-Step 'Aguardando Postgres ficar disponivel...'
    $maxWait = 60
    $waited = 0
    $status = ''
    while ($waited -lt $maxWait) {
        $pgId = Get-ServiceContainer 'postgres'
        if ($pgId) {
            $status = & docker inspect --format='{{.State.Health.Status}}' $pgId 2>$null
            if ($status -eq 'healthy') { break }
        }
        Start-Sleep -Seconds 2
        $waited += 2
    }
    if ($status -ne 'healthy') {
        throw "Postgres nao ficou pronto em $maxWait segundos"
    }
    Write-Host 'Postgres OK.' -ForegroundColor Green

    # --- 5. Restaura dump (se incluido) ---
    $dumpPath = Join-Path $releaseDir 'db/sic_2026.dump'
    if (Test-Path $dumpPath) {
        Write-Step 'Restaurando dump do banco...'

        # Aguarda migrate terminar (cria schema + seeds basicos antes do restore).
        $migrateMaxWait = 180
        $waited = 0
        while ($waited -lt $migrateMaxWait) {
            $mid = Get-ServiceContainer 'migrate'
            if ($mid) {
                $migrateStatus = & docker inspect --format='{{.State.Status}}' $mid 2>$null
                if ($migrateStatus -eq 'exited') { break }
            }
            Start-Sleep -Seconds 2
            $waited += 2
        }

        try {
            $pgId = Get-ServiceContainer 'postgres'
            Invoke-Native -Action 'cp do dump' -Block {
                & docker cp $dumpPath "${pgId}:/tmp/sic_2026.dump"
            }
            # pg_restore retorna != 0 com warnings em --clean; rodamos com
            # ErrorActionPreference=Continue e ignoramos o exit code.
            $prev = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            & docker exec $pgId pg_restore -U postgres -d sic_2026 --clean --if-exists --no-owner --no-acl /tmp/sic_2026.dump 2>&1 | Out-String | Write-Host
            $ErrorActionPreference = $prev
            & docker exec $pgId rm /tmp/sic_2026.dump 2>$null | Out-Null
            Write-Host 'Banco restaurado com a base da release.' -ForegroundColor Green
        } catch {
            Write-Warning "Falha ao restaurar dump: $_. Cliente comeca com banco vazio (seeds basicos)."
        }
    }

    # --- 6. Restaura vault (certificados) ---
    $vaultTar = Join-Path $releaseDir 'db/vault-data.tar'
    if (Test-Path $vaultTar) {
        Write-Step 'Restaurando vault de certificados...'
        # Nome do projeto compose = basename do InstallPath em lowercase. Volume
        # nomeado em compose: <project>_sic_2026_backend_tmp.
        $projectName = (Split-Path $InstallPath -Leaf).ToLower()
        $volumeName = "${projectName}_sic_2026_backend_tmp"
        $releaseDirUnix = $releaseDir -replace '\\', '/'

        # Confirma que o volume existe antes de tentar montar.
        & docker volume inspect $volumeName *> $null
        if ($LASTEXITCODE -eq 0) {
            try {
                # tar extract preserva owner (root) e mode (0600 do FileSystemCertificateVault).
                # Backend prod roda como user `app` (nao-root) e nao conseguiria ler.
                # Apos extrair, abrimos as permissoes pra qualquer user dentro do container
                # ler/escrever -- container e isolado, sem risco real.
                Invoke-Native -Action 'restore do vault' -Block {
                    & docker run --rm -v "${volumeName}:/data" -v "${releaseDirUnix}/db:/backup:ro" alpine:3 sh -c 'cd /data && tar -xf /backup/vault-data.tar && chmod -R a+rwX .'
                }
                Write-Host 'Certificados restaurados.' -ForegroundColor Green
            } catch {
                Write-Warning "Falha ao restaurar vault: $_. Cliente precisa reupload do PFX em /admin/certificates."
            }
        } else {
            Write-Warning "Volume '$volumeName' nao encontrado -- cliente precisa reupload do PFX em /admin/certificates."
        }

        # Restart backend/worker pra recarregar contexto, depois ALSO restart frontend
        # pra que o nginx re-resolva o IP do backend (sem isso, nginx cacheia o IP
        # antigo e da 502 ate restart manual).
        Invoke-Native -Action 'restart backend/worker' -Block {
            & docker compose -f docker-compose.prod.yml restart backend worker
        }
        Invoke-Native -Action 'restart frontend' -Block {
            & docker compose -f docker-compose.prod.yml restart frontend
        }
    }

    # --- 6b. Aguarda backend ficar healthy. Se nao ficar em 120s, dump dos logs ---
    Write-Step 'Aguardando backend ficar pronto...'
    $backendMaxWait = 120
    $waited = 0
    $bkStatus = ''
    while ($waited -lt $backendMaxWait) {
        $bkId = Get-ServiceContainer 'backend'
        if ($bkId) {
            $bkStatus = & docker inspect --format='{{.State.Health.Status}}' $bkId 2>$null
            if ($bkStatus -eq 'healthy') { break }
            # Se ja crashou em loop, nao espera o tempo todo
            $running = & docker inspect --format='{{.State.Running}}' $bkId 2>$null
            $restarts = & docker inspect --format='{{.RestartCount}}' $bkId 2>$null
            $restartCount = if ($restarts) { [int]$restarts } else { 0 }
            if ($running -eq 'false' -or $restartCount -ge 3) {
                Write-Host ''
                Write-Warning "Backend nao subiu (status=$bkStatus, restarts=$restarts). Logs:"
                & docker compose -f docker-compose.prod.yml logs backend --tail 80 2>&1 | Out-String | Write-Host
                throw 'Backend nao subiu corretamente. Veja os logs acima ou install.log.'
            }
        }
        Start-Sleep -Seconds 3
        $waited += 3
    }
    if ($bkStatus -ne 'healthy') {
        Write-Host ''
        Write-Warning "Backend nao ficou healthy em $backendMaxWait s. Logs:"
        & docker compose -f docker-compose.prod.yml logs backend --tail 80 2>&1 | Out-String | Write-Host
        throw "Backend nao ficou healthy em $backendMaxWait s."
    }
    Write-Host 'Backend OK.' -ForegroundColor Green

    # --- 7. Atalho na area de trabalho ---
    Write-Step 'Criando atalho na area de trabalho...'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'SIC NF-e.lnk'))
    $shortcut.TargetPath = 'http://localhost:8080'
    $shortcut.Save()

    Write-Host "`n================================================" -ForegroundColor Green
    Write-Host 'Instalacao concluida!' -ForegroundColor Green
    Write-Host '================================================' -ForegroundColor Green
    Write-Host "`nAcessar:        http://localhost:8080" -ForegroundColor Cyan
    Write-Host 'Login inicial:  admin@sic.local / Admin@123' -ForegroundColor Cyan
    Write-Host '                (TROQUE A SENHA NO PRIMEIRO LOGIN)' -ForegroundColor Yellow
    Write-Host "`nLogs:           docker compose -f $InstallPath\docker-compose.prod.yml logs -f"
    Write-Host "Parar:          docker compose -f $InstallPath\docker-compose.prod.yml down"
    Write-Host "Subir de novo:  docker compose -f $InstallPath\docker-compose.prod.yml up -d"
    } finally {
        Pop-Location
    }

    Wait-Exit 0
} catch {
    # Captura qualquer falha do corpo principal: mostra mensagem completa + stack,
    # garante que a janela do PS NAO fecha antes do usuario ler. Log fica em install.log.
    Write-Host ''
    Write-Host '================================================' -ForegroundColor Red
    Write-Host 'INSTALACAO FALHOU' -ForegroundColor Red
    Write-Host '================================================' -ForegroundColor Red
    Write-Host ''
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host ''
        Write-Host 'Stack trace:' -ForegroundColor DarkGray
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    }
    Wait-Exit 1
}

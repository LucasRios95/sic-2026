# =============================================================================
# download-icp-brasil.ps1 -- baixa e monta o bundle ICP-Brasil consolidado.
#
# Fonte oficial: ITI (Instituto Nacional de Tecnologia da Informacao). O arquivo
# `ACcompactado.zip` contem TODOS os certificados das ACs vigentes da ICP-Brasil
# (raiz + intermediarias), atualizado periodicamente. URL listada em:
#   https://www.gov.br/iti/pt-br/assuntos/repositorio/certificados-das-acs-da-icp-brasil-arquivo-unico-compactado
#
# O que faz:
#  1. Baixa o ZIP oficial do ITI (HTTPS)
#  2. Extrai num diretorio temporario
#  3. Converte cada .crt (DER) para PEM via certutil (nativo do Windows)
#  4. Concatena tudo num unico arquivo `icp-brasil.pem`
#  5. Move pro destino (./certs/icp-brasil.pem da instalacao)
#  6. Limpa o temp
#
# Uso:
#   .\download-icp-brasil.ps1                  # salva em ./certs/icp-brasil.pem
#   .\download-icp-brasil.ps1 -OutFile D:\meu\caminho\bundle.pem
#   .\download-icp-brasil.ps1 -UpdateEnv       # tambem ajusta NFE_TLS_CA_BUNDLE no .env
#
# Apos rodar, reinicie o backend pra carregar o bundle:
#   docker compose -f docker-compose.prod.yml restart backend worker
# =============================================================================

[CmdletBinding()]
param(
    [string]$OutFile = (Join-Path (Get-Location) 'certs\icp-brasil.pem'),
    [switch]$UpdateEnv,
    [string]$EnvFile = (Join-Path (Get-Location) '.env')
)

$ErrorActionPreference = 'Stop'

# URL oficial do arquivo unico compactado (cadeia VIGENTE — sem certs expirados).
$ZIP_URL = 'https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip'

Write-Host '================================================' -ForegroundColor Cyan
Write-Host 'Bundle ICP-Brasil -- download e montagem' -ForegroundColor Cyan
Write-Host '================================================' -ForegroundColor Cyan

$temp = Join-Path $env:TEMP "icp-brasil-$(Get-Random)"
$zipPath = Join-Path $temp 'ACcompactado.zip'
$extractDir = Join-Path $temp 'extracted'
$pemDir = Join-Path $temp 'pem'

try {
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
    New-Item -ItemType Directory -Force -Path $pemDir | Out-Null

    # --- 1. Download ---
    Write-Host "`n[1/4] Baixando bundle oficial do ITI..." -ForegroundColor Yellow
    Write-Host "      $ZIP_URL"

    # ServicePointManager + TLS 1.2: PS 5.1 default eh TLS 1.0/1.1, sites HTTPS modernos rejeitam.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
    Invoke-WebRequest -Uri $ZIP_URL -OutFile $zipPath -UseBasicParsing

    $zipSize = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
    Write-Host "      Baixados $zipSize KB"

    # --- 2. Extract ---
    Write-Host "`n[2/4] Extraindo certificados..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    $crtFiles = Get-ChildItem -Path $extractDir -Recurse -Include @('*.crt', '*.cer') -File
    Write-Host "      Encontrados $($crtFiles.Count) arquivos de certificado"

    if ($crtFiles.Count -eq 0) {
        throw 'Nenhum .crt encontrado no zip do ITI -- estrutura do arquivo mudou?'
    }

    # --- 3. Converte DER -> PEM (so quando preciso) ---
    # IMPORTANTE: certutil -encode re-codifica QUALQUER arquivo em base64, inclusive
    # PEM ja existente, gerando "PEM dentro de PEM" (base64 do texto -----BEGIN-----).
    # Por isso checamos primeiro se o .crt ja eh PEM e, se for, apenas copiamos.
    Write-Host "`n[3/4] Convertendo certificados para PEM..." -ForegroundColor Yellow
    $converted = 0
    $copied = 0
    $failed = 0
    foreach ($crt in $crtFiles) {
        $pemPath = Join-Path $pemDir ("$([System.IO.Path]::GetFileNameWithoutExtension($crt.Name)).pem")

        # Le os primeiros bytes pra detectar formato. PEM comeca com "-----BEGIN".
        $firstBytes = [System.IO.File]::ReadAllBytes($crt.FullName) | Select-Object -First 11
        $header = -join ($firstBytes | ForEach-Object { [char]$_ })

        if ($header -like '-----BEGIN*') {
            # Ja eh PEM -- apenas copia.
            Copy-Item -Path $crt.FullName -Destination $pemPath -Force
            $copied++
        } else {
            # DER binario -- converte via certutil.
            & certutil -encode $crt.FullName $pemPath > $null 2>&1
            if ($LASTEXITCODE -eq 0) {
                $converted++
            } else {
                $failed++
            }
        }
    }
    Write-Host "      PEM copiados: $copied | DER convertidos: $converted | Falhas: $failed"

    if (($converted + $copied) -eq 0) {
        throw 'Nenhum certificado convertido ou copiado.'
    }

    # --- 4. Concatena num unico PEM ---
    Write-Host "`n[4/4] Montando bundle consolidado..." -ForegroundColor Yellow
    $outDir = Split-Path -Parent $OutFile
    if ($outDir -and -not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    }

    $total = $converted + $copied
    $header = @"
# ICP-Brasil CA Bundle -- gerado por download-icp-brasil.ps1
# Fonte: $ZIP_URL
# Data: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# Total de certificados: $total (PEM copiados: $copied | DER convertidos: $converted)
# Cadeia: VIGENTE (sem expirados). Re-rode o script periodicamente para refresh.

"@
    Set-Content -Path $OutFile -Value $header -Encoding ASCII

    Get-ChildItem -Path $pemDir -Filter '*.pem' | Sort-Object Name | ForEach-Object {
        $content = Get-Content -Path $_.FullName -Raw
        # Mantem apenas o bloco BEGIN/END (certutil adiciona metadata ao redor as vezes).
        if ($content -match '(?s)(-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----)') {
            Add-Content -Path $OutFile -Value "# $($_.Name)" -Encoding ASCII
            Add-Content -Path $OutFile -Value $Matches[1] -Encoding ASCII
            Add-Content -Path $OutFile -Value '' -Encoding ASCII
        }
    }

    $outSize = [math]::Round((Get-Item $OutFile).Length / 1KB, 1)
    Write-Host "      Bundle gerado: $OutFile" -ForegroundColor Green
    Write-Host "      Tamanho: $outSize KB"

    # --- 5. (opcional) Atualiza .env ---
    if ($UpdateEnv) {
        if (Test-Path $EnvFile) {
            Write-Host "`nAjustando NFE_TLS_CA_BUNDLE em $EnvFile..." -ForegroundColor Yellow
            # Caminho do bundle DENTRO do container (independente de onde o host coloca o
            # arquivo, o compose monta ./certs em /app/certs).
            $envPath = '/app/certs/icp-brasil.pem'
            $content = Get-Content -Raw $EnvFile
            if ($content -match '(?m)^NFE_TLS_CA_BUNDLE=.*$') {
                $content = $content -replace '(?m)^NFE_TLS_CA_BUNDLE=.*$', "NFE_TLS_CA_BUNDLE=$envPath"
            } else {
                $content = $content.TrimEnd() + "`nNFE_TLS_CA_BUNDLE=$envPath`n"
            }
            Set-Content -Path $EnvFile -Value $content -Encoding UTF8
            Write-Host "      NFE_TLS_CA_BUNDLE=$envPath" -ForegroundColor Green
        } else {
            Write-Warning ".env nao encontrado em $EnvFile -- pule -UpdateEnv ou aponte com -EnvFile"
        }
    }

    Write-Host "`n================================================" -ForegroundColor Green
    Write-Host 'Bundle pronto.' -ForegroundColor Green
    Write-Host '================================================' -ForegroundColor Green
    Write-Host "`nProximos passos:" -ForegroundColor Cyan
    if (-not $UpdateEnv) {
        Write-Host "  1. Edite o .env e ajuste: NFE_TLS_CA_BUNDLE=/app/certs/icp-brasil.pem"
    }
    Write-Host "  $(if ($UpdateEnv) { '1' } else { '2' }). Reinicie o backend:"
    Write-Host "     docker compose -f docker-compose.prod.yml restart backend worker"

} finally {
    if (Test-Path $temp) {
        Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
    }
}

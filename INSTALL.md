# Instalação do SIC NF-e

Guia para instalar o sistema num PC Windows do cliente final. A release é
auto-contida: roda offline (sem acesso à internet) após o download inicial,
exceto pelas chamadas à SEFAZ no momento de emitir/sincronizar notas.

## Pré-requisitos no PC do cliente

| Requisito | Versão | Como instalar |
|---|---|---|
| Windows | 10 versão 2004+ ou 11 | já vem instalado |
| Docker Desktop | 4.x | https://www.docker.com/products/docker-desktop/ |
| Espaço em disco | ~3 GB livre | — |
| RAM | 4 GB livre (8 GB total recomendado) | — |

### Antes de começar

1. **Instale o Docker Desktop** e siga o passo-a-passo no primeiro start.
   Ele vai pedir pra reiniciar e habilitar virtualização (WSL2). Aceite tudo.
2. Quando o Docker Desktop estiver aberto, espere o ícone (lado do relógio)
   ficar **verde** — significa que o engine está pronto.

## Instalação

1. **Descompacte o ZIP da release** (`sic-2026-XXXXXX.zip`) em qualquer pasta,
   por exemplo na Área de Trabalho.

2. Dentro da pasta extraída, **clique com o botão direito em** `install.ps1` →
   **Executar com PowerShell**.
   - Se aparecer "Execução de scripts desabilitada", abra o PowerShell como
     administrador e rode antes: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

3. O script vai:
   - Verificar que o Docker está rodando
   - Criar a pasta `%USERPROFILE%\sic-nfe` (ex: `C:\Users\Carolina\sic-nfe`)
   - Carregar as imagens Docker (~600 MB descompactadas)
   - Gerar um `.env` com senhas novas e únicas para esta instalação
   - Subir os containers (Postgres, Redis, Backend, Worker, Frontend)
   - Restaurar a base de dados (clientes, produtos, certificados, etc.)
   - Criar um atalho `SIC NF-e` na Área de Trabalho

4. **Tempo total estimado:** 3–5 minutos na primeira vez.

## Como usar

- **Abrir o sistema:** duplo clique no atalho `SIC NF-e` na Área de Trabalho,
  ou abra o navegador em `http://localhost:8080`.
- **Login inicial:**
  - E-mail: `admin@sic.local`
  - Senha: `Admin@123`
  - **TROQUE A SENHA NO PRIMEIRO LOGIN** (ainda manual via API; UI vem depois)

## Operação no dia a dia

### Parar o sistema

```powershell
cd $env:USERPROFILE\sic-nfe
docker compose -f docker-compose.prod.yml down
```

Os dados ficam preservados — quando subir de novo, tudo volta como estava.

### Subir de novo

```powershell
cd $env:USERPROFILE\sic-nfe
docker compose -f docker-compose.prod.yml up -d
```

### Ver logs

```powershell
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f backend  # só o backend
```

### Inicialização automática junto com o Windows

O Docker Desktop, por padrão, sobe junto com o Windows. Como os containers têm
`restart: unless-stopped`, eles voltam sozinhos depois de qualquer reboot.

Para conferir: depois de reiniciar o PC, espere 1-2 minutos e abra
`http://localhost:8080` — o sistema deve carregar sozinho.

### Backup do banco

```powershell
cd $env:USERPROFILE\sic-nfe
docker exec sic_2026_postgres pg_dump -U postgres -d sic_2026 --format=custom > backup-$(Get-Date -Format yyyyMMdd).dump
```

Salve esse arquivo `.dump` num pen-drive ou drive externo. Em caso de pane no
PC, basta reinstalar a release e restaurar o dump.

## Produção SEFAZ (cadeia ICP-Brasil)

Por padrão o sistema vem configurado para **homologação SEFAZ** — não emite
NF-e válida fiscalmente, é só pra testes. Em produção, a SEFAZ usa certificados
emitidos pela cadeia ICP-Brasil, que **não vem no trust store padrão do Node.js**.
Sem o bundle, qualquer chamada vai falhar com `unable to get local issuer certificate`.

### Caminho recomendado: script automatizado

A release inclui `download-icp-brasil.ps1`, que baixa o arquivo oficial do ITI
(cadeia vigente, ~50 ACs em ~150 KB), converte e monta o bundle:

```powershell
cd $env:USERPROFILE\sic-nfe
.\download-icp-brasil.ps1 -UpdateEnv
```

O script faz tudo automaticamente:
1. Baixa `ACcompactado.zip` direto de `acraiz.icpbrasil.gov.br`
2. Extrai e converte cada `.crt` (DER) para PEM via `certutil` (nativo do Windows)
3. Concatena num único `certs/icp-brasil.pem`
4. Com `-UpdateEnv`, ajusta `NFE_TLS_CA_BUNDLE=/app/certs/icp-brasil.pem` no `.env`

Depois, reinicie o backend e troque o ambiente da empresa:

```powershell
docker compose -f docker-compose.prod.yml restart backend worker
```

E no sistema (menu **Empresas** → ✏️ Editar), mude **Ambiente SEFAZ** para `PRODUCAO`.

### Atualização periódica

A cadeia ICP-Brasil é atualizada quando uma AC nova é credenciada ou retirada.
O ITI publica em https://www.gov.br/iti/pt-br/assuntos/repositorio.

Re-rode o script a cada 6 meses (ou quando aparecer erro de validação SSL):

```powershell
.\download-icp-brasil.ps1
docker compose -f docker-compose.prod.yml restart backend worker
```

### Caminho manual (alternativa)

Se preferir não rodar o script:

1. Baixe direto: https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip
2. Extraia os `.crt`, converta cada um pra PEM (`certutil -encode arquivo.crt arquivo.pem`),
   concatene todos num único `icp-brasil.pem`.
3. Coloque em `%USERPROFILE%\sic-nfe\certs\icp-brasil.pem`.
4. Edite o `.env`: `NFE_TLS_CA_BUNDLE=/app/certs/icp-brasil.pem`.
5. Reinicie como acima.

## Solução de problemas

### "Algo deu errado" ao abrir o navegador

1. Confirme que o Docker Desktop está aberto (ícone verde).
2. Veja os logs:
   ```powershell
   docker compose -f $env:USERPROFILE\sic-nfe\docker-compose.prod.yml logs --tail 50
   ```
3. Confirme que a porta 8080 não está em uso por outro programa.

### Frontend abre mas tudo retorna erro

Verifique que o backend está saudável:
```powershell
curl http://localhost:8080/api/health
# deve responder: {"status":"ok","service":"sic-2026-backend"}
```

Se não responder, reinicie:
```powershell
docker compose -f $env:USERPROFILE\sic-nfe\docker-compose.prod.yml restart
```

### "Falha ao emitir NF-e" / "unable to get local issuer certificate"

A empresa está marcada como `PRODUCAO` mas o bundle ICP-Brasil não foi
configurado. Volte pra `HOMOLOGACAO` ou siga a seção "Produção SEFAZ" acima.

### Reinstalar do zero (CUIDADO — apaga dados)

```powershell
cd <pasta_da_release>
.\install.ps1 -Reinstall
```

## Suporte

Em caso de dúvidas operacionais, contate o responsável que entregou a release.

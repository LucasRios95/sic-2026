# Fluxogramas UX — Sistema Fiscal-Financeiro

> Derivado do **PRD v1.3** e do **schema Prisma v1.1** do produto.
> Combina visão executiva (mapa geral) e fluxos de tarefa críticos (operação real).

---

## 1. Mapa de Jornada Geral

Visão executiva: as grandes áreas do produto e como o usuário navega entre elas a partir do login. Cada perfil de acesso (RBAC) vê um subconjunto destas áreas conforme suas permissões.

```mermaid
flowchart TD
    Login([Login + MFA]) --> SelEmp{Múltiplas<br/>empresas?}
    SelEmp -->|Sim| EscEmp[Selecionar empresa]
    SelEmp -->|Não| Dash
    EscEmp --> Dash[Dashboard inicial]

    Dash --> Vendas[Vendas e Faturamento]
    Dash --> Compras[Compras]
    Dash --> Fiscal[Fiscal e Documentos]
    Dash --> Financeiro[Financeiro]
    Dash --> Relatorios[Relatórios]
    Dash --> Admin[Administração]

    Vendas --> V1[Pedidos de venda]
    Vendas --> V2[Emitir NF-e / NFS-e]
    Vendas --> V3[Devoluções]

    Compras --> C1[Pedidos de compra]
    Compras --> C2[Conferência de entrada]
    Compras --> C3[Fornecedores]

    Fiscal --> F1[Notas emitidas]
    Fiscal --> F2[Notas recebidas + manifestação]
    Fiscal --> F3[Eventos: cancelar, CC-e, inutilizar]
    Fiscal --> F4[Apuração assistida]

    Financeiro --> Fi1[Contas a receber]
    Financeiro --> Fi2[Contas a pagar]
    Financeiro --> Fi3[Bancos e conciliação]
    Financeiro --> Fi4[Fluxo de caixa]

    Relatorios --> R1[Mensais fiscais]
    Relatorios --> R2[Gerenciais]
    Relatorios --> R3[Exportação SPED]

    Admin --> A1[Empresas e filiais]
    Admin --> A2[Usuários e perfis]
    Admin --> A3[Certificados e tokens]
    Admin --> A4[Parâmetros fiscais]
    Admin --> A5[Auditoria]

    classDef root fill:#1F3864,color:#FFFFFF,stroke:#1F3864
    classDef area fill:#DCE6F1,color:#1F3864,stroke:#2E5C9A,stroke-width:2px
    classDef leaf fill:#F2F5FA,color:#1F3864,stroke:#BFBFBF

    class Login,Dash root
    class Vendas,Compras,Fiscal,Financeiro,Relatorios,Admin area
    class V1,V2,V3,C1,C2,C3,F1,F2,F3,F4,Fi1,Fi2,Fi3,Fi4,R1,R2,R3,A1,A2,A3,A4,A5 leaf
```

---

## 2. Fluxo Crítico — Emissão de NF-e modelo 55 (direto SEFAZ)

Caminho do faturista para emitir uma NF-e. Cobre o caminho feliz e os principais desvios (pré-validação local, rejeição da SEFAZ, contingência). Reflete os requisitos NFE-01 a NFE-08 e SEF-01 a SEF-06 do PRD.

```mermaid
flowchart TD
    Inicio([Faturista abre 'Nova NF-e']) --> Origem{Origem<br/>da nota?}
    Origem -->|A partir de pedido| Pedido[Selecionar pedido de venda]
    Origem -->|Manual| Cliente[Selecionar cliente]
    Pedido --> Cliente
    Cliente --> CliFiscal{Cliente tem<br/>atributos fiscais<br/>completos?}
    CliFiscal -->|Não| AlertaCli[Alerta: completar CRT,<br/>indFinal, indicador IE]
    AlertaCli --> EditCli[Editar cliente]
    EditCli --> CliFiscal
    CliFiscal -->|Sim| Itens[Adicionar/editar itens]

    Itens --> MotorTrib[Motor tributário calcula:<br/>ICMS, ICMS-ST, DIFAL, FCP,<br/>IPI, PIS/COFINS, IBS/CBS/IS]
    MotorTrib --> Preview[Pré-visualização do DANFE<br/>+ resumo de tributos]
    Preview --> Conferir{Faturista<br/>confere?}
    Conferir -->|Ajustar| Itens
    Conferir -->|OK| ValLocal[Validação local:<br/>XSD + regras das Notas Técnicas]

    ValLocal -->|Erro| ErroLocal[Listar erros com<br/>ação corretiva]
    ErroLocal --> Itens
    ValLocal -->|OK| Assinar[Assinar XML<br/>com certificado em cofre]
    Assinar --> SefazUp{SEFAZ<br/>disponível?}
    SefazUp -->|Não| Conting[Iniciar contingência<br/>EPEC ou SVC]
    SefazUp -->|Sim| Trans[Transmitir à SEFAZ<br/>autorizadora da UF]

    Trans --> Retorno{Retorno<br/>cStat}
    Retorno -->|100 Autorizada| Sucesso[Persistir XML autorizado,<br/>gerar DANFE, criar título<br/>a receber, baixar estoque]
    Retorno -->|105 Em processamento| Polling[Reconsulta por recibo]
    Polling --> Retorno
    Retorno -->|Rejeição| Erro[Mostrar mensagem traduzida<br/>+ ação corretiva]
    Erro --> Itens
    Retorno -->|Denegada| Denegada[Bloquear emissão<br/>+ notificar fiscal]

    Conting --> ContingOk[Emitir com numeração própria,<br/>marcar para reprocessamento]
    ContingOk --> Sucesso

    Sucesso --> Notif[Notificar cliente por e-mail<br/>com XML + DANFE]
    Notif --> Fim([NF-e autorizada])

    classDef start fill:#1F3864,color:#FFFFFF,stroke:#1F3864
    classDef action fill:#DCE6F1,color:#1F3864,stroke:#2E5C9A
    classDef decision fill:#F0E68C,color:#5F5E5A,stroke:#A38900
    classDef error fill:#F7C1C1,color:#791F1F,stroke:#A32D2D
    classDef success fill:#C0DD97,color:#173404,stroke:#3B6D11

    class Inicio,Fim start
    class Pedido,Cliente,EditCli,Itens,MotorTrib,Preview,Assinar,Trans,Polling,Conting,ContingOk,Notif action
    class Origem,CliFiscal,Conferir,ValLocal,SefazUp,Retorno decision
    class AlertaCli,ErroLocal,Erro,Denegada error
    class Sucesso success
```

---

## 3. Fluxo Crítico — Importação de Nota de Entrada e Manifestação

Caminho do recebimento (Comprador + Fiscal). Cobre captura automática via Distribuição de DF-e da SEFAZ (NSU), conferência manual, manifestação e geração do título financeiro. Reflete ENT-01 a ENT-15 do PRD.

```mermaid
flowchart TD
    Cron([Job agendado roda<br/>a cada N minutos]) --> Sefaz[Consulta Distribuição DF-e<br/>SEFAZ com ultNSU por CNPJ]
    Sefaz --> Novas{Documentos<br/>novos?}
    Novas -->|Não| FimCron([Nada a fazer])
    Novas -->|Sim| Salvar[Persistir resumos<br/>em ReceivedDocument]
    Salvar --> AtualCursor[Atualizar NsuCursor]
    AtualCursor --> NotifInbox[Notificar inbox<br/>de notas pendentes]

    UserInbox([Comprador abre inbox]) --> Lista[Lista de notas pendentes:<br/>fornecedor, valor, data]
    NotifInbox -.-> UserInbox
    Lista --> Sel[Selecionar nota]
    Sel --> TemPed{Existe pedido<br/>de compra vinculado?}

    TemPed -->|Sim| Auto[Vincular automaticamente<br/>e comparar valores]
    TemPed -->|Não| Manual[Busca/vinculação manual<br/>ou marcar 'sem pedido']
    Auto --> Diverg{Divergência<br/>de preço/qtd?}
    Manual --> Conf[Conferência item a item]
    Diverg -->|Sim| Aprov[Aprovação por alçada]
    Diverg -->|Não| Conf
    Aprov --> Conf

    Conf --> Manif{Manifestar?}
    Manif -->|Confirmar operação| EvtConf[Enviar evento<br/>'confirmação da operação']
    Manif -->|Desconhecer| EvtDesc[Enviar evento<br/>'desconhecimento']
    Manif -->|Não realizada| EvtNR[Enviar evento<br/>'operação não realizada']
    Manif -->|Apenas ciência| EvtCi[Enviar evento<br/>'ciência da operação']

    EvtConf --> Sefaz2[Transmissão SEFAZ<br/>+ aguarda protocolo]
    EvtDesc --> Sefaz2
    EvtNR --> Sefaz2
    EvtCi --> Sefaz2

    Sefaz2 --> RetMan{Aceito?}
    RetMan -->|Não| ErroMan[Mostrar erro<br/>+ permitir retentativa]
    RetMan -->|Sim| Escr{Escriturar?}
    ErroMan --> Manif

    Escr -->|Confirmação| FazEscr[Apropriar créditos IBS/CBS,<br/>gerar título a pagar,<br/>dar entrada em estoque]
    Escr -->|Desconhecimento/NR| Encerra[Marcar nota como<br/>não escriturada]

    FazEscr --> Fim([Nota escriturada<br/>e título criado])
    Encerra --> Fim

    classDef start fill:#1F3864,color:#FFFFFF,stroke:#1F3864
    classDef action fill:#DCE6F1,color:#1F3864,stroke:#2E5C9A
    classDef decision fill:#F0E68C,color:#5F5E5A,stroke:#A38900
    classDef error fill:#F7C1C1,color:#791F1F,stroke:#A32D2D
    classDef bg fill:#E1F5EE,color:#04342C,stroke:#0F6E56

    class Cron,FimCron,UserInbox,Fim start
    class Sefaz,Salvar,AtualCursor,NotifInbox,Lista,Sel,Auto,Manual,Conf,Aprov,EvtConf,EvtDesc,EvtNR,EvtCi,Sefaz2,FazEscr,Encerra action
    class Novas,TemPed,Diverg,Manif,RetMan,Escr decision
    class ErroMan error
```

---

## 4. Fluxo Crítico — Emissão de NFS-e via Focus NF-e

Caminho do faturista de serviços. Diferente da NF-e: comunicação assíncrona via API REST + webhook (com polling como fallback). Reflete NFS-01 a NFS-14 e FNF-01 a FNF-08 do PRD.

```mermaid
flowchart TD
    Inicio([Faturista abre 'Nova NFS-e']) --> Tomador[Selecionar tomador<br/>+ verificar atributos fiscais]
    Tomador --> Servicos[Adicionar serviços prestados<br/>+ discriminação]
    Servicos --> MotorTribS[Motor tributário calcula:<br/>ISS, retenções federais,<br/>IBS/CBS]

    MotorTribS --> CompMun[Identificar município<br/>de competência]
    CompMun --> Rota{Município<br/>migrado para<br/>NFS-e Nacional?}
    Rota -->|Sim| RotaN[Rotear para<br/>API NFS-e Nacional]
    Rota -->|Não| RotaM[Rotear para<br/>API NFS-e municipal]

    RotaN --> PrevDPS[Compor DPS<br/>Declaração de Prestação]
    RotaM --> Payload[Compor payload<br/>Focus NF-e]
    PrevDPS --> Payload

    Payload --> SubmitFocus[Submeter à Focus NF-e<br/>com idempotencyKey próprio]
    SubmitFocus --> PreVal{Pré-validação<br/>síncrona OK?}
    PreVal -->|Não| ErroPre[Mostrar erro de validação<br/>+ ação corretiva]
    ErroPre --> Servicos
    PreVal -->|Sim| Fila[Documento na fila Focus<br/>status: PROCESSING]

    Fila --> Espera{Como chega<br/>o resultado?}
    Espera -->|Webhook| Hook[Receber webhook<br/>autenticado e idempotente]
    Espera -->|Sem webhook em X min| Poll[Polling agendado<br/>consulta status]

    Hook --> RetNFS{Resultado?}
    Poll --> RetNFS
    RetNFS -->|Autorizada| Sucesso[Persistir XML + DANFSe,<br/>criar título a receber]
    RetNFS -->|Rejeitada| ErroFinal[Mostrar erro da prefeitura,<br/>permitir corrigir e reemitir]
    RetNFS -->|Em processamento| Poll

    Sucesso --> Envio[Disponibilizar DANFSe<br/>+ enviar ao tomador]
    Envio --> Fim([NFS-e autorizada])
    ErroFinal --> Servicos

    classDef start fill:#1F3864,color:#FFFFFF,stroke:#1F3864
    classDef action fill:#DCE6F1,color:#1F3864,stroke:#2E5C9A
    classDef decision fill:#F0E68C,color:#5F5E5A,stroke:#A38900
    classDef error fill:#F7C1C1,color:#791F1F,stroke:#A32D2D
    classDef success fill:#C0DD97,color:#173404,stroke:#3B6D11

    class Inicio,Fim start
    class Tomador,Servicos,MotorTribS,CompMun,RotaN,RotaM,PrevDPS,Payload,SubmitFocus,Fila,Hook,Poll,Envio action
    class Rota,PreVal,Espera,RetNFS decision
    class ErroPre,ErroFinal error
    class Sucesso success
```

---

## 5. Fluxo Crítico — Cancelamento de NF-e (com regras de prazo e auditoria)

Ação destrutiva e auditada. Cobre cancelamento dentro e fora do prazo legal e o uso de CC-e como alternativa. Reflete NFE-05 e SEF-09 do PRD.

```mermaid
flowchart TD
    Acao([Usuário seleciona NF-e<br/>e clica 'Cancelar']) --> Perm{Tem permissão<br/>'nfe.cancel'?}
    Perm -->|Não| Bloq[Bloquear ação<br/>+ orientar a contatar admin]
    Perm -->|Sim| Status{Status atual<br/>da NF-e?}

    Status -->|DRAFT/PENDING| Local[Cancelamento local<br/>sem evento SEFAZ]
    Status -->|AUTHORIZED| Prazo{Dentro do<br/>prazo legal?<br/>até 24h após autorização}
    Status -->|Outro| NA[Mostrar mensagem:<br/>operação não aplicável]

    Prazo -->|Não| Alt{Erro é só<br/>em campo<br/>corrigível?}
    Alt -->|Sim| SugCCe[Sugerir Carta de Correção<br/>CC-e como alternativa]
    Alt -->|Não| SugDev[Sugerir nota de devolução<br/>ou nota de ajuste]
    SugCCe --> CCe[Fluxo CC-e]
    SugDev --> Fim

    Prazo -->|Sim| Just[Solicitar justificativa<br/>mín. 15 caracteres]
    Just --> Conf{Confirmar?<br/>'Esta ação é irreversível'}
    Conf -->|Cancelar| Fim
    Conf -->|Confirmar| Evento[Criar evento de cancelamento<br/>+ assinar + transmitir SEFAZ]

    Evento --> RetSef{Retorno SEFAZ?}
    RetSef -->|135 Aceito| Cancela[Atualizar status: CANCELLED<br/>+ registrar protocolo<br/>+ AuditLog]
    RetSef -->|Rejeitado| ErroEv[Mostrar motivo<br/>+ permitir retentativa]
    ErroEv --> Just

    Cancela --> Efeitos[Estornar título financeiro,<br/>devolver estoque,<br/>notificar cliente]
    Efeitos --> Fim([NF-e cancelada])
    Local --> Fim

    classDef start fill:#1F3864,color:#FFFFFF,stroke:#1F3864
    classDef action fill:#DCE6F1,color:#1F3864,stroke:#2E5C9A
    classDef decision fill:#F0E68C,color:#5F5E5A,stroke:#A38900
    classDef error fill:#F7C1C1,color:#791F1F,stroke:#A32D2D
    classDef warn fill:#FAC775,color:#412402,stroke:#854F0B

    class Acao,Fim start
    class Local,Just,Evento,Cancela,Efeitos,CCe action
    class Perm,Status,Prazo,Alt,Conf,RetSef decision
    class Bloq,NA,ErroEv error
    class SugCCe,SugDev warn
```

---

## 6. Fluxo Crítico — Configuração de Empresa Nova (onboarding)

Caminho do Administrador para colocar uma empresa em produção. Cobre o setup multiempresa com flags de habilitação tributária (modelo 6.1.1 do PRD), certificado e ambiente.

```mermaid
flowchart TD
    Inicio([Admin abre 'Nova empresa']) --> Dados[Dados básicos:<br/>CNPJ, IE, IM, endereço]
    Dados --> ValCnpj{CNPJ válido<br/>e único no tenant?}
    ValCnpj -->|Não| ErroCnpj[Mostrar erro<br/>específico]
    ErroCnpj --> Dados
    ValCnpj -->|Sim| CRT[Selecionar CRT:<br/>Simples, Excesso,<br/>Normal ou MEI]

    CRT --> Flags[Configurar flags<br/>de habilitação tributária]
    Flags --> F1[usaIcms · usaIcmsSt · usaIpi]
    Flags --> F2[usaDifal · usaFcp · usaIcmsDesonerado]
    F1 --> Doc{Quais documentos<br/>emite?}
    F2 --> Doc

    Doc --> EmiNFE[Habilitar NF-e<br/>+ configurar série e ambiente]
    Doc --> EmiNFS[Habilitar NFS-e<br/>+ provisionar na Focus NF-e]

    EmiNFE --> Cert[Upload do certificado A1<br/>+ senha]
    Cert --> ValCert{Certificado válido<br/>e CNPJ confere?}
    ValCert -->|Não| ErroCert[Erro: certificado<br/>incompatível]
    ErroCert --> Cert
    ValCert -->|Sim| Cofre[Persistir referência<br/>vault + metadata]

    EmiNFS --> Focus[Chamar API de Empresas<br/>com dry_run primeiro]
    Focus --> DryOk{Dry-run<br/>OK?}
    DryOk -->|Não| ErroFocus[Erro Focus:<br/>corrigir e tentar de novo]
    ErroFocus --> Focus
    DryOk -->|Sim| FocusCreate[Provisionamento real<br/>+ guardar tokens]

    Cofre --> Homo[Modo HOMOLOGAÇÃO ativo]
    FocusCreate --> Homo
    Homo --> Test[Sugerir emissão de teste<br/>em homologação]

    Test --> Aprov{Empresa aprovada<br/>nos testes?}
    Aprov -->|Não| Aj[Ajustar configurações]
    Aj --> Test
    Aprov -->|Sim| Prod[Alternar para PRODUÇÃO<br/>com confirmação dupla]
    Prod --> Audit[AuditLog: empresa pronta<br/>+ snapshot da configuração]
    Audit --> Fim([Empresa operacional])

    classDef start fill:#1F3864,color:#FFFFFF,stroke:#1F3864
    classDef action fill:#DCE6F1,color:#1F3864,stroke:#2E5C9A
    classDef decision fill:#F0E68C,color:#5F5E5A,stroke:#A38900
    classDef error fill:#F7C1C1,color:#791F1F,stroke:#A32D2D
    classDef flag fill:#EEEDFE,color:#26215C,stroke:#534AB7

    class Inicio,Fim start
    class Dados,CRT,EmiNFE,EmiNFS,Cert,Cofre,Focus,FocusCreate,Homo,Test,Aj,Prod,Audit action
    class ValCnpj,Doc,ValCert,DryOk,Aprov decision
    class ErroCnpj,ErroCert,ErroFocus error
    class Flags,F1,F2 flag
```

---

## 7. Fluxo Crítico — Fechamento Mensal Fiscal

Caminho recorrente do Fiscal/Contábil para fechar o mês. Combina vários módulos (entradas, saídas, manifestações, apuração assistida) e termina nos relatórios e exportação. Reflete REL-01 a REL-06 do PRD.

```mermaid
flowchart TD
    Inicio([Fiscal inicia<br/>'Fechamento mensal']) --> Periodo[Selecionar período<br/>mês/ano + empresa]
    Periodo --> Checklist[Painel de pendências do mês]

    Checklist --> P1[Notas emitidas em DRAFT/PENDING]
    Checklist --> P2[Notas recebidas sem manifestação]
    Checklist --> P3[Notas recebidas sem escrituração]
    Checklist --> P4[Eventos de cancelamento pendentes]
    Checklist --> P5[Divergências CST/cClassTrib]

    P1 --> R1{Resolver?}
    P2 --> R2{Resolver?}
    P3 --> R3{Resolver?}
    P4 --> R4{Resolver?}
    P5 --> R5{Resolver?}

    R1 -->|Sim| Acao1[Ir para o documento]
    R2 -->|Sim| Acao2[Manifestar]
    R3 -->|Sim| Acao3[Conferir e escriturar]
    R4 -->|Sim| Acao4[Tratar evento]
    R5 -->|Sim| Acao5[Reclassificar tributariamente]

    R1 -->|Justificar| Justif[Registrar justificativa<br/>para auditoria]
    R2 -->|Justificar| Justif
    R3 -->|Justificar| Justif
    R4 -->|Justificar| Justif
    R5 -->|Justificar| Justif

    Acao1 --> Reabre[Reabrir checklist]
    Acao2 --> Reabre
    Acao3 --> Reabre
    Acao4 --> Reabre
    Acao5 --> Reabre
    Reabre --> Checklist

    Justif --> Limpo{Checklist<br/>zerado ou<br/>justificado?}
    Limpo -->|Não| Checklist
    Limpo -->|Sim| Apura[Apuração assistida:<br/>débitos × créditos IBS/CBS<br/>+ ICMS/ISS na transição]

    Apura --> Rel[Gerar relatórios mensais:<br/>entradas, saídas, serviços,<br/>apuração, memória de cálculo]
    Rel --> Rev{Fiscal aprova<br/>os números?}
    Rev -->|Não| AjFiscal[Ajustar lançamentos<br/>ou parâmetros]
    AjFiscal --> Checklist
    Rev -->|Sim| Export[Exportar para contabilidade<br/>+ disponibilizar para SPED]

    Export --> Bloqueio[Bloquear edição<br/>do período fechado]
    Bloqueio --> AuditMes[AuditLog: fechamento<br/>+ snapshot de totais]
    AuditMes --> Fim([Mês fechado])

    classDef start fill:#1F3864,color:#FFFFFF,stroke:#1F3864
    classDef action fill:#DCE6F1,color:#1F3864,stroke:#2E5C9A
    classDef decision fill:#F0E68C,color:#5F5E5A,stroke:#A38900
    classDef pend fill:#FAC775,color:#412402,stroke:#854F0B
    classDef success fill:#C0DD97,color:#173404,stroke:#3B6D11

    class Inicio,Fim start
    class Periodo,Checklist,Acao1,Acao2,Acao3,Acao4,Acao5,Justif,Reabre,Apura,Rel,AjFiscal,Export,Bloqueio,AuditMes action
    class R1,R2,R3,R4,R5,Limpo,Rev decision
    class P1,P2,P3,P4,P5 pend
```

---

## Como ler os diagramas

**Convenção de cores aplicada em todos os fluxos:**

- **Azul-marinho** — início e fim
- **Azul-claro** — ações do usuário e do sistema
- **Amarelo** — decisões (lógica condicional)
- **Vermelho** — caminhos de erro / bloqueios
- **Verde** — caminhos de sucesso
- **Outras cores semânticas** — laranja (pendências), lilás (configuração)

**Como cada fluxo se conecta ao schema Prisma:**

| Fluxo | Models principais envolvidos |
|---|---|
| 1. Mapa geral | Estrutura macro — Tenant, Company, User, UserRole, Permission |
| 2. Emissão NF-e | NFe, NFeItem, Customer, Product, ProductTaxRule, InterstateAliquot, IcmsInternaUf, IcmsStMva, SefazTransmission, NumberingSeries |
| 3. Importação entrada | ReceivedDocument, NsuCursor, DfeManifestation, Supplier, AccountPayable, StockMovement |
| 4. Emissão NFS-e | NFSe, NFSeItem, Service, ServiceTaxRule, FocusRequest, WebhookEvent, AccountReceivable |
| 5. Cancelamento | NFeEvento, NFe (status), AuditLog, AccountReceivable (estorno), StockMovement (estorno) |
| 6. Onboarding | Company (com flags), Certificate, IntegrationCredential, AuditLog |
| 7. Fechamento mensal | NFe, NFSe, ReceivedDocument, DfeManifestation, TaxParameter, AuditLog |

**Próximos passos a partir destes fluxos:**

1. Validar cada fluxo com os usuários reais (Faturista, Comprador, Fiscal, Financeiro) — fluxograma é hipótese até alguém usar
2. Derivar wireframes/mockups para as telas mais críticas (Emissão NF-e, Inbox de notas recebidas, Checklist de fechamento)
3. Mapear cada nó de erro/decisão para uma mensagem de UI específica — é onde a diferença entre "funciona" e "é usável" aparece
4. Cobertura de testes E2E: cada caminho do diagrama vira pelo menos um caso de teste

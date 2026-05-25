# PRD — Sistema Fiscal-Financeiro
## Reforma Tributária · v1.3

> **Documento de Requisitos do Produto.** Versão 1.3 — 22 de maio de 2026.
> Conversão para markdown a partir do .docx oficial. Para o documento formatado,
> consulte o arquivo `.docx` correspondente.


| Atributo | Valor |
| --- | --- |
| Documento | Product Requirements Document (PRD) |
| Produto (codinome) | Novo Sistema Fiscal-Financeiro — substituição do legado Delphi/BDE/Paradox |
| Versão do documento | 1.3 |
| Data | 19 de maio de 2026 |
| Modelo de emissão | Híbrido: NF-e modelo 55 e recepção de entradas direto na SEFAZ; NFS-e (Nacional e municipal) via Focus NF-e |
| Status | Para revisão de stakeholders |
| Classificação | Interno — Confidencial |
| Público-alvo | Diretoria, Produto, Engenharia, Fiscal/Contábil, QA |


**Aviso de conformidade: ** *Este documento descreve requisitos com base na regulamentação da Reforma Tributária vigente em maio de 2026 (notadamente as Notas Técnicas RT 2025.002 da NF-e/NFC-e, SE/CGNFS-e 007/2026 da NFS-e Nacional e RT 2026.001 do split payment). A arquitetura de emissão é híbrida: a NF-e modelo 55 e a recepção de documentos de entrada são implementadas em comunicação direta com a SEFAZ; a NFS-e (Nacional e municipal) utiliza a Focus NF-e como gateway. As regras de negócio são parametrizáveis e devem acompanhar continuamente a evolução normativa.*


## Controle de Versões e Aprovações


### Histórico de revisões


| Versão | Data | Autor | Descrição |
| --- | --- | --- | --- |
| 0.1 | 12/05/2026 | Engenharia | Estrutura inicial e levantamento regulatório |
| 0.5 | 16/05/2026 | Produto + Fiscal | Detalhamento de módulos fiscais e financeiro |
| 1.0 | 19/05/2026 | Produto | Versão consolidada para revisão de stakeholders |
| 1.1 | 19/05/2026 | Produto + Engenharia | Incorporação da Focus NFe como gateway de emissão e recepção de DF-e; nova Seção 7 (Arquitetura de Integração Fiscal); ajuste dos módulos fiscais, financeiro e administrativo; riscos e dependências de terceiro |
| 1.2 | 19/05/2026 | Produto + Engenharia | Adoção de modelo híbrido: NF-e modelo 55 e recepção de entradas direto na SEFAZ; NFS-e (Nacional e municipal) via Focus NF-e. Reescrita da Seção 7 como Arquitetura de Emissão Fiscal; novos requisitos SEF-xx; Fase 1 do roadmap ampliada; riscos recalibrados |
| 1.3 | 22/05/2026 | Produto + Engenharia | Detalhamento do modelo de tributação (nova Seção 6.1.1): atributos fiscais de destinatário/fornecedor, flags de habilitação tributária por empresa, tratamento completo da tributação interestadual (ICMS interestadual, DIFAL, FCP, ICMS-ST) e tabelas globais oficiais versionadas (alíquotas Senado, MVA Confaz, benefícios por UF). Stack tecnológica definida (Seção 10): PostgreSQL + Prisma ORM. |


### Aprovações


| Papel | Nome | Responsabilidade | Status |
| --- | --- | --- | --- |
| Patrocinador (Sponsor) | — | Aprovação de escopo e orçamento | Pendente |
| Product Owner | — | Priorização e aceite de requisitos | Pendente |
| Líder Técnico / Arquiteto | — | Viabilidade técnica e arquitetura | Pendente |
| Responsável Fiscal/Contábil | — | Conformidade tributária | Pendente |
| Líder de QA | — | Estratégia de testes e aceitação | Pendente |


# Sumário


*Ao abrir no Microsoft Word, clique com o botão direito sobre o sumário abaixo e selecione “Atualizar campo” (ou pressione F9) para gerar automaticamente a lista de seções e os números de página.*


## 1. Sumário Executivo


Este PRD especifica um novo sistema integrado de emissão de documentos fiscais eletrônicos, controle de vendas e compras, faturamento e gestão financeira, destinado a substituir o sistema legado atual escrito em Delphi com base de dados BDE/Paradox. O produto atende empresas de qualquer regime tributário (Simples Nacional, Lucro Presumido e Lucro Real) e nasce já preparado para o novo modelo de tributação sobre o consumo introduzido pela Reforma Tributária.


Os dois pilares fiscais do produto são a emissão da Nota Fiscal Eletrônica modelo 55 (NF-e) e da Nota Fiscal de Serviço Eletrônica (NFS-e), ambas adequadas aos tributos IBS, CBS e Imposto Seletivo (IS), conforme as Notas Técnicas vigentes. A arquitetura de emissão é “híbrida por tipo de documento”: a NF-e modelo 55 e a recepção de documentos de entrada (notas contra o CNPJ) são implementadas em comunicação direta com a SEFAZ — preservando autonomia, custo unitário e controle do ciclo de vida dos documentos; a NFS-e (Nacional e municipal) utiliza a Focus NF-e como gateway, evitando o custo elevado de integrar centenas de prefeituras heterogêneas. O sistema também consome documentos de entrada e serviços tomados a partir de XML, PDF e dos serviços oficiais (distribuição de DF-e da SEFAZ para NF-e/CT-e; “notas recebidas” da Focus NF-e para NFS-e Nacional), incluindo a manifestação do destinatário.


Sobre essa base, o produto entrega controle de vendas e compras, contas a pagar e a receber, fluxo de caixa e um conjunto de relatórios gerenciais e fiscais mensais — com destaque para os mapas de entradas e saídas e os relatórios de serviços prestados e tomados. Toda a operação é multiusuário, com perfis e níveis de acesso granulares e trilha de auditoria.


**Recomendação central: **dada a transição regulatória 2026–2033 — com 2026 como ano de testes, vigência plena da CBS em 2027 e substituição gradual de ICMS/ISS pelo IBS até 2033 — o produto deve tratar regras tributárias como configuração versionada por vigência, e não como código fixo. Esta é a principal lição a carregar do legado para a nova arquitetura.


### 1.1 Problema

- O sistema legado em Delphi/BDE/Paradox apresenta limitações estruturais: base de arquivos Paradox sujeita a corrupção e a arquivos de lock órfãos, dificuldade de acesso multiusuário em rede, ausência de APIs e barreira para evoluir frente às exigências da Reforma Tributária.
- As Notas Técnicas da Reforma exigem reestruturação profunda dos layouts de NF-e e NFS-e (novos grupos, campos por item e regras de validação), inviável de acompanhar de forma sustentável no legado.
- Processos de entrada de notas (compras e serviços tomados) são manuais, sem captura automática a partir da SEFAZ/Portal Nacional, gerando retrabalho e risco de divergência fiscal.

### 1.2 Visão do produto


Uma plataforma web multiempresa e multiusuário que centraliza emissão fiscal, escrituração de entradas, controle comercial e gestão financeira, com motor tributário parametrizável capaz de operar simultaneamente o regime antigo e o novo durante toda a transição. A camada de comunicação fiscal adota um modelo híbrido — comunicação direta com a SEFAZ para NF-e modelo 55 e recepção de entradas, e gateway Focus NF-e para NFS-e — isolada por uma camada de integração própria (anticorrupção) que mantém o produto resiliente a mudanças de provedores e do arcabouço normativo, e preserva a opção de evoluir cada caminho independentemente.


### 1.3 Métricas de sucesso (resumo)


| Indicador | Meta |
| --- | --- |
| Conformidade de emissão (NF-e/NFS-e aceitas sem rejeição por erro de layout/regra) | ≥ 99,5% |
| Cobertura de captura automática de notas de entrada (XML/SEFAZ) | ≥ 95% das notas destinadas ao CNPJ |
| Tempo de fechamento mensal (entradas × saídas conciliadas) | Redução ≥ 60% vs. legado |
| Disponibilidade do serviço de emissão | ≥ 99,5% mensal |
| Migração de dados do legado sem perda de histórico fiscal | 100% conciliado |


## 2. Contexto e Motivação


### 2.1 O sistema legado


O sistema atual é uma aplicação desktop em Delphi que utiliza o Borland Database Engine (BDE) sobre tabelas Paradox, com arquivos hospedados em uma máquina principal e acesso por estações secundárias via unidade de rede mapeada. Esse modelo impõe fragilidades conhecidas: arquivos de bloqueio órfãos que exigem remoção manual, sensibilidade a configuração de diretório de rede e de alias do BDE, risco de corrupção de índices/tabelas e ausência de camada de serviços para integrações fiscais modernas.


A modernização visa preservar o conhecimento de negócio consolidado no legado, mas eliminar a dependência de BDE/Paradox e do compartilhamento de arquivos em rede, adotando um banco de dados relacional transacional, uma camada de aplicação com API e uma interface web acessível por múltiplos usuários simultâneos.


### 2.2 Drivers de negócio

- Conformidade obrigatória com a Reforma Tributária do Consumo a partir do calendário de transição (impacto imediato já em 2026 para o regime normal).
- Redução de risco operacional (corrupção de base, indisponibilidade) e de risco fiscal (rejeições, créditos indevidos, autuações).
- Ganho de produtividade: captura automática de notas de entrada, conciliação financeira e fechamento mensal assistido.
- Escalabilidade multiusuário/multiempresa e base para futuras integrações (contabilidade, meios de pagamento, e-commerce).

### 2.3 Cenário regulatório — Reforma Tributária do Consumo


A Emenda Constitucional 132/2023, regulamentada pela Lei Complementar 214/2025 (com alterações posteriores, incluindo a LC 227/2026), substitui cinco tributos sobre o consumo (PIS, COFINS, IPI, ICMS e ISS) por um modelo de IVA Dual composto por três tributos:


| Tributo | Competência | Substitui | Observação para o produto |
| --- | --- | --- | --- |
| CBS — Contribuição sobre Bens e Serviços | Federal | PIS e COFINS (e parte do IPI) | Vigência plena a partir de 2027 |
| IBS — Imposto sobre Bens e Serviços | Estadual e municipal (compartilhado) | ICMS e ISS | Substituição gradual entre 2029 e 2032; pleno em 2033 |
| IS — Imposto Seletivo | Federal | Tributação seletiva de bens/serviços nocivos | Incidência a partir de 2027 |


*Cronograma de transição (visão consolidada — * *base para o roadmap de conformidade do produto, Seção 9* *):*


| Ano | Marco regulatório | Implicação no produto |
| --- | --- | --- |
| 2026 | Ano de testes. CBS (0,9%) e IBS (0,1%) destacados de forma simbólica nos DF-e; sem recolhimento se cumpridas as obrigações acessórias. PIS/COFINS/ICMS/ISS/IPI seguem inalterados. Destaque obrigatório para contribuintes do regime normal (CRT 3). | Emitir com os novos grupos e campos preenchidos e validados; conviver com tributação antiga; não recolher os novos tributos. |
| 2027 | Vigência plena da CBS; extinção de PIS e COFINS; início do IS; IPI reduzido a zero (exceto ZFM); início faseado do split payment; obrigatoriedade de IBS/CBS estendida a Simples Nacional e MEI (CRT 1, 2 e 4). | Apuração efetiva da CBS; descontinuar PIS/COFINS; suportar split payment; ampliar obrigatoriedade a todos os regimes. |
| 2028 | Consolidação da CBS e do IS; ICMS/ISS ainda vigentes. | Estabilização; ajustes de apuração. |
| 2029–2032 | Substituição gradual de ICMS/ISS pelo IBS, com redução progressiva das alíquotas estaduais/municipais e crescimento proporcional do IBS. | Operar dois regimes em paralelo com alíquotas por vigência e cálculo proporcional. |
| 2033 | Extinção completa de ICMS, ISS, PIS, COFINS e IPI (salvo exceções constitucionais, p.ex. ZFM). IVA Dual pleno. | Operação apenas no novo modelo; legado tributário mantido só para histórico. |


**Conclusão de engenharia: **o produto precisa suportar a coexistência de regimes por vários anos. Alíquotas, CST, códigos de classificação tributária e regras de validação devem ser dados versionados por data de vigência e por Nota Técnica, com possibilidade de simulação (“ano-teste”) sem efeito de recolhimento.


## 3. Objetivos do Produto e Métricas de Sucesso


### 3.1 Objetivos

1. Emitir NF-e modelo 55 e NFS-e em conformidade com as Notas Técnicas da Reforma Tributária, com validação prévia (pré-emissão) que reduza rejeições.
1. Capturar e escriturar automaticamente notas de entrada e serviços tomados (XML, PDF, SEFAZ e Portal Nacional da NFS-e).
1. Controlar o ciclo completo de vendas e compras, integrado a estoque fiscal e ao financeiro.
1. Disponibilizar gestão financeira (contas a pagar/receber, fluxo de caixa, conciliação) preparada para o split payment.
1. Entregar relatórios mensais fiscais e gerenciais — com ênfase em entradas, saídas e serviços prestados/tomados — e apoiar a apuração assistida.
1. Operar como sistema multiempresa, multiusuário e com níveis de acesso, substituindo integralmente o legado sem perda de histórico.

### 3.2 Métricas e critérios de sucesso


| Objetivo | Métrica | Meta | Como medir |
| --- | --- | --- | --- |
| Conformidade fiscal | Taxa de rejeição por erro de layout/regra | < 0,5% | Logs de retorno SEFAZ/Portal Nacional |
| Automação de entradas | % de notas de entrada capturadas automaticamente | ≥ 95% | Conciliação NSU × notas escrituradas |
| Produtividade | Tempo médio de fechamento mensal | −60% vs. legado | Cronometragem do processo de fechamento |
| Confiabilidade | Disponibilidade do módulo de emissão | ≥ 99,5%/mês | Monitoramento de uptime |
| Migração | Integridade do histórico migrado | 100% conciliado | Reconciliação automatizada legado × novo |
| Adoção | Usuários ativos sobre total previsto após 60 dias | ≥ 90% | Métricas de uso do sistema |


## 4. Escopo


### 4.1 Dentro do escopo

- Emissão de NF-e modelo 55 (incluindo notas de ajuste — finalidades de nota de crédito e nota de débito — e eventos da NF-e) adequada a IBS/CBS/IS, em comunicação direta com a SEFAZ autorizadora.
- Emissão de NFS-e (padrão nacional e municipal) por meio da Focus NF-e, respeitando a cobertura de municípios integrados do provedor.
- Importação/escrituração de documentos de entrada e serviços tomados via XML, PDF (com extração de dados), distribuição de DF-e da SEFAZ (NF-e e CT-e, por NSU) e serviço de “notas recebidas” da Focus NF-e para NFS-e Nacional, incluindo a manifestação do destinatário.
- Controle de vendas e de compras, cadastros fiscais (produtos/NCM, serviços, clientes, fornecedores, tributação por vigência).
- Gestão financeira: contas a pagar e a receber, fluxo de caixa, conciliação e preparação para split payment.
- Relatórios mensais fiscais e gerenciais; apoio à apuração assistida de IBS/CBS.
- Administração: multiempresa, multiusuário, perfis e níveis de acesso (RBAC), auditoria e conformidade com a LGPD.
- Migração de dados do sistema legado (cadastros, histórico fiscal e financeiro).

### 4.2 Fora do escopo (nesta versão)

- Escrituração fiscal e contábil completa (SPED EFD ICMS/IPI, EFD-Contribuições, ECD/ECF) — o produto fornecerá exportações e dados, mas a entrega das obrigações poderá ser feita por sistema contábil parceiro.
- Folha de pagamento, RH e tributos sobre a renda/folha.
- Emissão de outros DF-e (CT-e, CT-e OS, MDF-e, NFC-e modelo 65, NFCom, DCe) — fora do escopo desta versão. A NFC-e modelo 65, em particular, é uma decisão pendente que pode entrar em release posterior (varejo presencial) com emissão direta na SEFAZ; a arquitetura deve permanecer extensível para habilitar esses documentos sem reescrita.
- Integração nativa com adquirentes/PSPs para execução do split payment — em 2026 o requisito é preparatório (estrutura de dados e eventos, incluindo o Evento de Conciliação Financeira/ECONF); a execução automática entra no roadmap conforme a regulamentação de 2027.

### 4.3 Premissas

- A emissão de NF-e modelo 55 e a recepção de DF-e serão feitas em comunicação direta com os ambientes oficiais da SEFAZ (autorizadoras e ambiente nacional), com aderência aos web services e schemas vigentes. A emissão de NFS-e (Nacional e municipal) usará a Focus NF-e como gateway (ambientes de homologação e produção, REST, assíncrono + webhooks).
- Certificado digital (e-CNPJ A1 ou A3) por empresa emitente: para NF-e (emissão direta), o certificado fica custodiado pelo produto em cofre dedicado e é utilizado para assinatura/transmissão; para NFS-e via Focus NF-e, o certificado fica registrado no provedor.
- As regras de negócio tributárias serão parametrizáveis e atualizadas conforme novas Notas Técnicas; a empresa manterá processo formal de monitoramento normativo (e do roadmap da Focus NF-e para o trecho de NFS-e).
- A cobertura de NFS-e depende da lista de municípios integrados da Focus NF-e; municípios fora da cobertura ou com regras específicas exigem tratamento à parte.
- Conectividade de internet estável nas estações e no servidor de aplicação; o produto implementará contingência fiscal para NF-e (EPEC/SVC/offline) conforme regras da SEFAZ.
- A empresa definirá a estratégia de obrigações acessórias (SPED) com a contabilidade; o produto fornecerá os dados necessários.

## 5. Personas e Perfis de Acesso


### 5.1 Personas


| Persona | Necessidades principais |
| --- | --- |
| Operador de Faturamento | Emitir NF-e/NFS-e rapidamente, corrigir erros, reemitir, acompanhar status de autorização. |
| Comprador / Recebimento | Importar e conferir notas de entrada, vincular a pedidos de compra, dar entrada em estoque. |
| Analista Fiscal / Contador | Validar tributação, classificar itens (CST/cClassTrib), gerar relatórios e dados de apuração. |
| Financeiro (Contas a pagar/receber) | Gerir títulos, baixas, conciliação bancária, fluxo de caixa e impacto do split payment. |
| Gestor / Diretoria | Visão consolidada de vendas, compras, margem e caixa; relatórios gerenciais. |
| Administrador do Sistema | Gerir empresas, usuários, perfis, certificados, parâmetros fiscais e auditoria. |


### 5.2 Modelo de níveis de acesso (RBAC)


O controle de acesso é baseado em papéis (RBAC), com permissões granulares por módulo e por operação, segregação por empresa (multiempresa) e princípio do menor privilégio. Perfis são configuráveis; os abaixo são modelos de referência.


| Perfil | Emissão | Entradas | Financeiro | Relatórios | Admin |
| --- | --- | --- | --- | --- | --- |
| Administrador | Total | Total | Total | Total | Total |
| Gestor | Ver | Ver | Ver | Total | — |
| Faturista | Criar/Emitir/Cancelar* | — | — | Operac. | — |
| Fiscal/Contábil | Ver/Validar | Ver/Classificar | Ver | Total | Parâmetros fiscais |
| Compras | — | Importar/Conferir | Solicitar título | Operac. | — |
| Financeiro | — | Ver | Total | Financeiros | — |


* Cancelamento e operações irreversíveis exigem permissão específica e ficam registrados em trilha de auditoria com motivo, usuário e timestamp. Ações sensíveis (cancelar/inutilizar nota, excluir título, alterar parâmetro fiscal) devem suportar dupla checagem/aprovação configurável.


## 6. Requisitos Funcionais


Os requisitos estão agrupados por módulo e identificados por código (RF-<módulo>-<n>) para rastreabilidade com casos de teste e backlog. Prioridade segue MoSCoW: M = Must, S = Should, C = Could.


### 6.1 Módulo de Cadastros Base


Fundamenta toda a operação fiscal. A correção tributária do produto depende da qualidade destes cadastros e do nível de detalhe com que descrevem as características fiscais de cada entidade. Como o produto atenderá empresas de perfis muito diferentes (Simples Nacional intraestadual, indústria com Substituição Tributária, distribuidor interestadual), os cadastros precisam carregar todos os atributos fiscais relevantes; o comportamento por empresa é controlado por flags de habilitação tributária (ver 6.1.1).


| ID | Prior. | Requisito |
| --- | --- | --- |
| CAD-01 | M | Cadastro de empresas (emitentes) com CNPJ, IE, IM, CRT (1=Simples Nacional, 2=excesso de sublimite, 3=regime normal, 4=MEI), regime tributário, certificados digitais e ambientes (homologação/produção), além das flags de habilitação tributária descritas em 6.1.1 (uso de ICMS, ICMS-ST, IPI, DIFAL, FCP, ICMS desonerado). |
| CAD-02 | M | Cadastro de produtos com NCM, CEST, unidade, origem da mercadoria (0..8), GTIN/EAN, indicador de importado, controle de estoque, e amarração tributária por vigência detalhada em 6.1.1 (CST/CSOSN de ICMS, redução de base, ST com MVA e redução, ICMS desonerado, FCP, IPI inclusive por valor unitário, PIS/COFINS inclusive por valor unitário, e IBS/CBS/IS da Reforma com CST e cClassTrib). |
| CAD-03 | M | Cadastro de serviços com código de tributação nacional/municipal, item da lista de serviços (LC 116/2003 e alterações), CNAE, e classificação tributária de ISS na transição (CST, alíquota, tipo de retenção, PIS/COFINS/CSLL retidos) e de IBS/CBS na Reforma (CST, cClassTrib, cIndOp). |
| CAD-04 | M | Cadastro de clientes e fornecedores (PF/PJ) com indicador de contribuinte (1/2/9), regime tributário (CRT do destinatário/fornecedor), indicador de consumidor final, indicador de presença (presencial/internet/outros), endereços completos com código IBGE do município, suporte a destinatário no exterior (cPais), inscrição na SUFRAMA quando aplicável, e dados comerciais (limite de crédito, bloqueio). |
| CAD-05 | M | Tabelas tributárias versionadas por data de vigência e por Nota Técnica, conforme detalhado em 6.1.1: alíquotas de IBS/CBS/IS, CST, cClassTrib/cIndOp, NBS/itens de serviço, e tributos em transição (ICMS/ISS/PIS/COFINS/IPI). Inclui as tabelas globais oficiais (alíquotas interestaduais do Senado, alíquotas internas por UF, MVA de ICMS-ST por Confaz, FCP por UF, benefícios fiscais por UF). |
| CAD-06 | M | Motor de regras tributárias parametrizável (por UF de origem/destino, município, regime do emitente, regime do destinatário, tipo de operação, CFOP/natureza, NCM, finalidade da operação) sem necessidade de recompilar o sistema; capaz de operar regime antigo e Reforma em paralelo durante a transição. |
| CAD-07 | S | Importação inicial de cadastros a partir do legado (Paradox/BDE) e de planilhas, com validação e relatório de inconsistências; manter dicionário de-para auditado. |
| CAD-08 | S | Validação automática de NCM/CEST, CFOP, CNAE, CNPJ, municípios (IBGE), códigos tributários municipais e itens da lista de serviço contra tabelas oficiais publicadas, mantendo cache local versionado. As consultas auxiliares disponibilizadas pela Focus NF-e podem ser usadas como uma das fontes para alimentar/atualizar esse cache. |
| CAD-09 | C | Sugestão assistida de CST/CSOSN/cClassTrib por similaridade com itens já classificados na mesma empresa. |
| CAD-10 | M | Tabelas globais oficiais alimentadas e mantidas pelo produto (compartilhadas entre todas as empresas, versionadas por vigência): alíquotas interestaduais por par UF origem/destino (Resolução Senado 22/89 e 13/2012), alíquotas internas e FCP geral por UF, MVA de ICMS-ST por UF origem/destino/NCM (protocolos Confaz, com MVA original e ajustada), benefícios fiscais por UF e NCM com código cBenef. |
| CAD-11 | S | Atualização das tabelas globais oficiais por processo formal de monitoramento normativo, com janela de homologação e ativação por vigência; sem deploy de código sempre que possível. |
| CAD-12 | M | Cadastro de séries de numeração de DF-e por empresa, modelo e série, com reserva transacional para evitar duplicidade em concorrência (ver NFE-08). |
| CAD-13 | S | Cadastro de listas de preço por empresa, com vigência, preço de venda por produto e desconto máximo permitido. |


#### 6.1.1 Modelo de Tributação


Esta subseção descreve como o produto representa as obrigações tributárias da empresa. A diretriz arquitetural é “schema completo + parametrização por empresa”: o produto carrega todos os campos fiscais relevantes do regime brasileiro atual e da Reforma, e cada empresa habilita os grupos de tributos que efetivamente se aplicam à sua operação. Isso permite que empresas com perfis muito diferentes coexistam no mesmo sistema sem migrações nem código condicional disperso.


#### 6.1.1.1 Flags de habilitação tributária por empresa


A empresa declara, no momento do cadastro, quais grupos de tributos a sua operação envolve. As flags atuam como interruptores: quando desabilitada, a regra de cálculo correspondente é ignorada pelo motor tributário e os campos correlatos permanecem em branco nos documentos.


| Flag | Quando habilitar |
| --- | --- |
| usaIcms | Empresas do regime normal ou Simples Nacional (com CSOSN) que operam com mercadorias. Padrão: habilitada. |
| usaIcmsSt | Empresas que comercializam produtos sujeitos a Substituição Tributária (autopeças, bebidas, cosméticos, eletrônicos, ferramentas, entre outros). |
| usaIpi | Empresas industriais e equiparadas a indústria (importadores, atacadistas em situações específicas). |
| usaDifal | Empresas que realizam operações interestaduais com consumidor final (B2C) ou interestaduais para destinatário não contribuinte. |
| usaFcp | Empresas cujos produtos ou destinos têm incidência do Fundo de Combate à Pobreza (em geral, vendas interestaduais para UFs que instituíram o FCP). |
| usaIcmsDesonerado | Empresas que operam com isenção ou redução de ICMS com desoneração (Convênios específicos, Zona Franca, benefícios setoriais). |


**Princípio: **o produto não tenta inferir o perfil da empresa. As flags são uma decisão de configuração explícita feita no setup (ou alterada quando a operação muda), com efeitos auditados.


#### 6.1.1.2 Atributos fiscais nos cadastros de clientes e fornecedores


A tributação correta depende não apenas dos atributos do produto, mas também de quem é o destinatário ou fornecedor. Os cadastros carregam os atributos abaixo, todos relevantes para o cálculo no momento da emissão ou da escrituração:


| Atributo | No cliente? | No fornecedor? | Por que importa |
| --- | --- | --- | --- |
| Indicador de IE (1=Contribuinte, 2=Isento, 9=Não contribuinte) | Sim | Sim | Determina aplicabilidade de DIFAL e tratamento de ST. |
| Regime tributário (CRT do destinatário/fornecedor) | Sim | Sim | Influencia partilha de DIFAL, ST e — para entradas — apropriação de crédito (especialmente com fornecedores do Simples). |
| Indicador de consumidor final (indFinal) | Sim | — | Gatilho do DIFAL quando combinado com operação interestadual. |
| Indicador de presença (indPres) | Sim | — | Distingue venda presencial, e-commerce e telemarketing — impacta DIFAL e regras de ST. |
| UF e código IBGE do município | Sim | Sim | Determina se a operação é intraestadual ou interestadual, e qual alíquota interestadual aplicar. |
| SUFRAMA | Sim | — | Operações com destino à Zona Franca de Manaus e Áreas de Livre Comércio. |
| País de destino (cPais) | Sim | — | Operações de exportação. |


#### 6.1.1.3 Tributação por produto — regime antigo (transição até 2032)


A tributação do produto é versionada por vigência (validFrom/validTo). Cada versão carrega os atributos abaixo. Campos opcionais (a maioria) ficam em branco quando não se aplicam à operação.


| Grupo de tributos | Atributos cadastrados no produto |
| --- | --- |
| ICMS próprio | CST (00..90) ou CSOSN (101..900 para Simples), origem da mercadoria, modalidade de base de cálculo (modBC), alíquota, percentual de redução de base (pRedBC), indicador de produto importado (força alíquota interestadual de 4%). |
| ICMS-ST | CST/CSOSN aplicável com ST, modalidade de BC da ST (modBCST), MVA padrão (pMVAST) — pode ser sobrescrita por regra global em IcmsStMva por par UF/NCM —, redução de base da ST (pRedBCST), alíquota efetiva (pICMSST), alíquota efetiva quando há desoneração (pICMSEfet). |
| ICMS desonerado | Motivo da desoneração (motDesICMS) — Taxi, produtor agropecuário, órgãos públicos, Olimpíadas etc. |
| FCP | Alíquota padrão do produto (pFCP), FCP retido por ST (pFCPST), FCP retido anteriormente (pFCPSTRet) — sobrescritos por UF de destino via tabela global. |
| IPI | CST, código de enquadramento legal (cEnq), alíquota; quando aplicável, IPI por valor unitário (ipiPorUnidade + vUnidIpi) para cigarros, bebidas e correlatos. |
| PIS e COFINS | CST, alíquotas próprias; PIS/COFINS por valor unitário (quando regime monofásico). |


#### 6.1.1.4 Tributação por produto — Reforma Tributária (IBS / CBS / IS)


Convive com a tributação antiga durante a transição (2026 ano-teste; 2027 vigência plena da CBS; 2029–2032 substituição gradual de ICMS/ISS pelo IBS; 2033 IVA pleno).


| Atributo | Descrição |
| --- | --- |
| CST de IBS/CBS | Código de Situação Tributária da Reforma (tributação integral, redução de alíquota/base, diferimento, suspensão, isenção, imunidade, não incidência, crédito presumido). |
| Código de Classificação Tributária (cClassTrib) | Vinculação ao dispositivo da LC 214/2025 que ampara a tributação do item, conforme tabela do Informe Técnico RT 2025.002. |
| Alíquotas próprias do produto (aliqIbsProduto, aliqCbsProduto) | Quando o produto tem alíquota específica que sobrescreve a alíquota padrão da UF/município do destino. Vazio = usar padrão da UF (em IcmsInternaUf evoluído ou parâmetro tributário global). |
| CST e alíquota do Imposto Seletivo (cstIs, aliqIs) | Quando o produto sofre incidência do IS (bens prejudiciais à saúde ou ao meio ambiente). |
| Indicador de incidência de IS (incidenciaIs) | Flag explícita; produtos não sujeitos ao IS permanecem em false. |


#### 6.1.1.5 Tributação interestadual


A tributação interestadual no regime antigo é definida por três mecanismos que coexistem; todos precisam ser tratados pelo produto durante a transição.


| Mecanismo | Quando se aplica | Como o produto trata |
| --- | --- | --- |
| Alíquota interestadual de ICMS | Sempre que a venda cruza fronteiras estaduais (7% para destinos Norte/Nordeste/Centro-Oeste/ES vindos do Sul/Sudeste exceto ES; 12% nas demais; 4% para mercadorias importadas conforme Resolução Senado 13/2012). | Tabela global InterstateAliquot, indexada por par UF origem/UF destino e vigência. Tabela de referência alimentada uma vez e atualizada quando normas mudarem. |
| DIFAL (Diferencial de Alíquotas) | Operação interestadual com consumidor final (contribuinte ou não); a diferença entre alíquota interna do destino e a interestadual é recolhida ao destino, com FCP somado quando aplicável. EC 87/2015 e LC 190/2022. | Calculado no momento da emissão a partir de Customer.consumidorFinal + UF origem ≠ UF destino + IcmsInternaUf[ufDestino]. Persistido no NFeItem nos campos do grupo ICMSUFDest (baseICMSUFDest, pICMSUFDest, pICMSInter, valorICMSUFDest etc.) e nos totais da NF-e. |
| FCP — Fundo de Combate à Pobreza | Adicional de 1% a 4% sobre certos produtos, instituído por UFs específicas; soma-se ao DIFAL nas operações interestaduais B2C ou ao ICMS próprio nas internas das UFs que adotam. | Tabela IcmsInternaUf carrega o FCP geral por UF; ProductTaxRule pode sobrescrever por produto. Persistido nos campos vFCP, vFCPUFDest do NFeItem. |


**Na Reforma, **o IBS adota o princípio do destino puro (a alíquota do estado de destino é a que vale). Durante a transição 2029–2032, ICMS (decrescente) e IBS (crescente) operam em paralelo, proporcionalmente. As tabelas e cálculos descritos acima permanecem ativos enquanto o ICMS existir.


#### 6.1.1.6 Substituição Tributária (ICMS-ST)


O sistema suporta os três cenários clássicos de ST quando a flag usaIcmsSt estiver habilitada para a empresa: (a) ST do remetente (o emitente recolhe o ICMS-ST devido nas operações subsequentes); (b) ST retido anteriormente (a operação atual tem ST já recolhido por substituto a montante na cadeia); (c) ST do destinatário (situações específicas de ST por entrada). A MVA — Margem de Valor Agregado — é central no cálculo e varia por UF de origem, UF de destino e NCM, conforme protocolos Confaz.


O produto mantém a tabela global IcmsStMva versionada, com MVA original (operação interna) e MVA ajustada (operação interestadual, calculada conforme Convênio ICMS 35/2011). Quando uma regra global cobre o item, ela prevalece sobre a MVA cadastrada no produto.


#### 6.1.1.7 Benefícios fiscais por UF (cBenef)


Operações com isenção, redução de base, redução de alíquota, crédito presumido ou diferimento concedidos por UF utilizam o código de benefício fiscal (cBenef) da NF-e. O produto mantém a tabela global BeneficioFiscalUf versionada, indexada por UF e (opcionalmente) NCM, permitindo aplicação automática pelo motor tributário e preenchimento correto do XML.


#### 6.1.1.8 Tabelas globais oficiais


Quatro tabelas servem como fonte da verdade para qualquer cálculo tributário do regime antigo, são compartilhadas entre todas as empresas do sistema e são alimentadas/atualizadas por processo formal de monitoramento normativo:


| Tabela | Conteúdo | Origem da informação |
| --- | --- | --- |
| InterstateAliquot | Alíquota interestadual por par (UF origem, UF destino), com vigência. Distingue mercadorias nacionais (7%/12%) e importadas (4%). | Resolução do Senado 22/89 e 13/2012; muda raramente. |
| IcmsInternaUf | Alíquota interna geral e FCP geral por UF. | Cada UF — definidas por lei estadual. |
| IcmsStMva | MVA original e ajustadas (4%, 7%, 12%) por par (UF origem, UF destino, NCM). | Protocolos e convênios Confaz; atualização frequente. |
| BeneficioFiscalUf | Códigos cBenef por UF e (opcionalmente) NCM, com tipo de benefício e percentual. | Legislação estadual; por UF e produto. |


**Estratégia de manutenção: **uma área (fiscal ou parceria com contabilidade) é responsável por monitorar normas, propor atualizações nessas tabelas e gerar registros versionados com data de início de vigência. As empresas usuárias do produto não precisam se preocupar com isso — as tabelas globais ficam sempre atualizadas e os cálculos refletem automaticamente.


#### 6.1.1.9 Como o motor tributário consome esses cadastros


Para emitir uma NF-e, o motor tributário executa, na ordem, a seguinte sequência conceitual:

1. Lê os atributos fiscais do destinatário (CRT, consumidorFinal, UF, indicador de IE) — Customer.
1. Verifica as flags de habilitação tributária da empresa emitente (Company).
1. Resolve a regra tributária vigente do produto (ProductTaxRule onde validFrom ≤ hoje ≤ validTo).
1. Se a operação for interestadual, busca a alíquota em InterstateAliquot pelo par UF origem/UF destino.
1. Se a empresa usa DIFAL e o destinatário é consumidor final em outra UF, calcula DIFAL com IcmsInternaUf[UF destino].
1. Se há ST aplicável, busca MVA em IcmsStMva (UF origem, UF destino, NCM) — sobrescreve a MVA do produto.
1. Se há benefício fiscal aplicável, identifica o cBenef em BeneficioFiscalUf.
1. Calcula ICMS próprio, ICMS-ST, FCP, DIFAL, IPI, PIS, COFINS (regime antigo) e IBS, CBS, IS (Reforma) — populando o item e somando nos totais da NF-e.

**Princípio arquitetural: **o banco persiste o resultado e as referências; o cálculo vive no código de aplicação (motor tributário). Isso facilita testes, rastreabilidade e evolução com a Reforma.


### 6.2 Módulo de Emissão de NF-e Modelo 55 (IBS/CBS/IS) — Direto SEFAZ


Implementa a emissão da NF-e adequada à Nota Técnica RT 2025.002 (que substitui a RT NT 2024.002 e versões anteriores), incluindo os novos grupos e campos de IBS, CBS e IS por item e por total, e as novas finalidades de nota de ajuste. A comunicação é feita diretamente com a SEFAZ autorizadora da UF do emitente (e ambiente nacional quando aplicável), via web services SOAP oficiais. Os aspectos técnicos da integração (assinatura, validação, contingência, custódia de certificado) estão detalhados na Seção 7.


#### 6.2.1 Emissão e ciclo de vida


| ID | Prior. | Requisito |
| --- | --- | --- |
| NFE-01 | M | Compor o XML da NF-e modelo 55 (entrada e saída) conforme o schema vigente, assinar digitalmente (XML-DSig com canonicalização correta) e transmitir à SEFAZ autorizadora por web service, recebendo o protocolo de autorização. |
| NFE-02 | M | Gerar e disponibilizar o DANFE (incluindo layout adequado aos novos tributos IBS/CBS/IS) e o XML autorizado; envio ao destinatário por e-mail. |
| NFE-03 | M | Tratar todos os retornos da SEFAZ: autorizada (cStat 100), em processamento (cStat 105), rejeitada (com código e mensagem — incluindo a faixa ampliada de rejeições de IBS/CBS/IS), denegada e erros de comunicação; reconsulta por chave/recibo quando necessário. |
| NFE-04 | M | Contingência fiscal conforme regras da SEFAZ (EPEC — Evento Prévio de Emissão em Contingência; SVC-AN/SVC-RS — Sefaz Virtual de Contingência; e, quando aplicável, FS-DA), com controle de numeração própria e reprocessamento posterior. |
| NFE-05 | M | Cancelamento dentro do prazo legal (24h após autorização, podendo variar por UF), Carta de Correção Eletrônica (CC-e, até 20 correções, valendo a última) e inutilização de faixa de numeração; todos com auditoria, controle de permissão e respectiva comunicação à SEFAZ. |
| NFE-06 | M | Eventos da NF-e suportados pela SEFAZ (incluindo Ator Interessado, Insucesso na Entrega, ECONF e os novos eventos da Reforma quando publicados); consulta de situação e de eventos pela chave de acesso. |
| NFE-07 | M | Pré-visualização do DANFE (sem valor fiscal) para conferência antes da emissão definitiva. |
| NFE-08 | M | Numeração por série e por empresa controlada pelo produto, com reserva transacional (bloqueio para evitar duplicidade em concorrência) e suporte a inutilização de faixa. |
| NFE-09 | S | Emissão em lote (fila resiliente, idempotência, sem duplicar nota/numeração em retransmissões), conforme Seção 7. |
| NFE-10 | S | Importar XML de NF-e autorizada gerada por outro sistema (ex.: histórico do legado) para manter o histórico unificado e habilitar consulta/auditoria; eventos só serão suportados se a SEFAZ permitir para o emitente. |


#### 6.2.2 Tributação IBS / CBS / IS (Reforma)


| ID | Prior. | Requisito |
| --- | --- | --- |
| NFE-20 | M | Preencher, por item, o CST de IBS/CBS e o Código de Classificação Tributária (cClassTrib), vinculados ao dispositivo aplicável da LC 214/2025, conforme tabela do Informe Técnico RT 2025.002. |
| NFE-21 | M | Calcular e destacar IBS, CBS e IS por item e nos grupos de totais do documento (total do item e total do DF-e — IBS/CBS/IS). |
| NFE-22 | M | Suportar operações especiais: Zona Franca de Manaus e Áreas de Livre Comércio, tributação monofásica, alíquota zero, isenção/suspensão/diferimento e crédito presumido, conforme indicadores das Notas Técnicas. |
| NFE-23 | M | Modo “ano-teste” (2026): destacar IBS/CBS de forma simbólica com validação integral dos campos, sem gerar obrigação de recolhimento, mantendo a tributação do regime antigo em paralelo. |
| NFE-24 | M | Aplicar a regra correta por CRT do emitente e respeitar o calendário de obrigatoriedade (regime normal desde 2026; Simples/MEI a partir de 2027), de forma parametrizável por vigência. |
| NFE-25 | M | Validador de pré-emissão local que aplica as regras das Notas Técnicas (XSD + regras numeradas) antes da transmissão, reduzindo rejeições. |
| NFE-26 | S | Referenciamento de itens de outro DF-e (devolução, retorno, ajuste) com rastreabilidade item a item. |
| NFE-27 | S | Grupo de informações de antecipação de pagamento e dos dados necessários à futura vinculação financeira (preparação para split payment — ver 6.7.2 e Seção 7). |


#### 6.2.3 Notas de ajuste (crédito/débito)


| ID | Prior. | Requisito |
| --- | --- | --- |
| NFE-30 | M | Emitir Nota de Crédito e Nota de Débito (novas finalidades da NF-e) para ajustes de valores/tributos no modelo de débito e crédito do IVA, em substituição a ajustes manuais. |
| NFE-31 | M | Vincular a nota de ajuste ao documento de origem e refletir o efeito nos controles de vendas/compras, financeiro e nos dados de apuração. |
| NFE-32 | S | Bloquear uso indevido de notas de ajuste fora das hipóteses regulamentares (validação por regra parametrizável). |


### 6.3 Módulo de Emissão de NFS-e


Implementa a emissão da NFS-e por meio da Focus NFe, que oferece tanto a API de NFS-e Nacional (DPS, padrão nacional adequado à NT SE/CGNFS-e 007/2026) quanto a API de NFS-e municipal (para municípios ainda não migrados). O produto seleciona a via adequada por município e trata a coexistência durante a transição. Campos da Reforma podem não ser aceitos por todos os municípios; o produto deve degradar com segurança conforme a cobertura do provedor.


#### 6.3.1 Emissão


| ID | Prior. | Requisito |
| --- | --- | --- |
| NFS-01 | M | Gerar a DPS e emitir a NFS-e no padrão nacional via API de NFS-e Nacional da Focus NFe (pré-validação síncrona + processamento assíncrono), com obtenção do DANFSe e do XML/JSON. |
| NFS-02 | M | Para municípios não migrados, emitir via API de NFS-e municipal da Focus NFe, roteando automaticamente pela lista de municípios integrados do provedor. |
| NFS-03 | M | Informar corretamente o CRT (incluindo CRT 4 para MEI, obrigatório na NFS-e nacional) e os dados do prestador/tomador, inclusive serviços tomados com retenção. |
| NFS-04 | M | Emitir, na via nacional, os documentos de novos fatos geradores que passam a ser documentados (p.ex. bens imateriais, locação de bens móveis, locação/cessão/arrendamento de imóveis, servidão/direito de passagem), quando não autorizáveis nos sistemas municipais. |
| NFS-05 | M | Cancelamento/substituição da NFS-e via Focus NFe conforme regras nacionais/municipais, tratando municípios que não permitem cancelamento por web service, com auditoria. |
| NFS-06 | S | Reenvio de NFS-e por e-mail e consulta de status via Focus NFe (consulta e/ou webhook). |


#### 6.3.2 Tributação IBS / CBS e tributos federais


| ID | Prior. | Requisito |
| --- | --- | --- |
| NFS-10 | M | Preencher os grupos de IBS/CBS da DPS conforme o layout vigente, incluindo o indicador de operação (cIndOp) com base na tabela oficial atualizada e o indicador de operação com CBS alíquota zero em ZFM/ALC (indZFMALC). |
| NFS-11 | M | Utilizar o código de tributação nacional (cTribNac) adequado a cada fato gerador, evitando uso indevido de código genérico. |
| NFS-12 | M | Tratar PIS/COFINS/CSLL conforme a NT: campos de valor de PIS e COFINS apenas para débitos próprios da operação (não para retenções), com os códigos de retenção e CST revisados; aplicar arredondamento half-even e tolerância de R$ 0,01. |
| NFS-13 | M | Modo “ano-teste” para os grupos de IBS/CBS (preenchimento e validação sem efeito de recolhimento), conforme calendário aplicável ao prestador. |
| NFS-14 | S | Apoio à apuração municipal/nacional do ISS na transição e exportação de dados para o Módulo de Apuração Nacional (MAN) quando o município aderir (adesão voluntária). |


**Dependência de provedor: **os campos da Reforma na API de NFS-e da Focus NFe são marcados como “(RT)” e podem não ser interpretados por todos os municípios durante a transição. O produto deve preencher os campos quando suportados, registrar quando o município não os aceita e acompanhar a migração dos municípios para a API de NFS-e Nacional.


### 6.4 Módulo de Importação e Entradas (notas de entrada e serviços tomados)


Captura, valida e escritura documentos recebidos, alimentando compras, estoque fiscal, financeiro e os dados de apuração (créditos de IBS/CBS). A captura automática de NF-e e CT-e recebidos usa o web service oficial de Distribuição de DF-e da SEFAZ (controle por NSU); a captura de NFS-e Nacional recebida usa o serviço de “notas recebidas” da Focus NF-e, coerente com a emissão de NFS-e.


#### 6.4.1 Captura


| ID | Prior. | Requisito |
| --- | --- | --- |
| ENT-01 | M | Importar XML de NF-e/NFS-e/CT-e (arquivo único ou lote), com validação de schema e de chave de acesso e detecção de duplicidade. |
| ENT-02 | M | Distribuição de DF-e da SEFAZ para NF-e e CT-e destinados ao CNPJ: consulta periódica e incremental pelo Último NSU recebido (ultNSU), com paginação e armazenamento do XML/resumo retornado; persistir o cursor NSU por CNPJ. |
| ENT-03 | M | Manifestação do destinatário diretamente na SEFAZ (eventos: ciência da operação, confirmação da operação com justificativa, desconhecimento da operação, operação não realizada), com controle de prazo e auditoria. |
| ENT-04 | M | Captura de NFS-e Nacional recebidas via Focus NF-e (cursor por “versao” e cabeçalhos X-Total-Count/X-Max-Version), com webhook como caminho primário e polling como fallback. |
| ENT-05 | M | Captura de NFS-e municipais tomadas a partir de portais/integrações disponíveis (XML/JSON), quando o município oferecer; importação manual permitida em qualquer caso. |
| ENT-06 | M | Importação por PDF: extração de dados do DANFE/DANFSe (chave, emitente, valores, itens) com revisão assistida; quando houver chave, priorizar o XML completo obtido via SEFAZ (NF-e/CT-e) ou Focus NF-e (NFS-e Nacional). |
| ENT-07 | S | Importação pela chave de acesso (digitada ou via leitor de código de barras), com recuperação do XML quando disponível. |


**Nota de segurança: **a captura é automática, mas a escrituração com efeitos fiscais/financeiros (geração de título a pagar, entrada em estoque, apropriação de crédito) exige conferência/aprovação humana conforme perfil. Manifestações e ações irreversíveis seguem as regras de permissão e auditoria.


#### 6.4.2 Escrituração e conferência


| ID | Prior. | Requisito |
| --- | --- | --- |
| ENT-10 | M | Conferência da nota de entrada contra pedido de compra (preço, quantidade, itens) com tratamento de divergências e bloqueio configurável. |
| ENT-11 | M | Escriturar tributos de entrada, incluindo apropriação de créditos de IBS/CBS no novo modelo (não cumulatividade plena), respeitando vigência e regime. |
| ENT-12 | M | Gerar automaticamente o título a pagar (contas a pagar) a partir da nota conferida, com parcelas/duplicatas e vínculo ao fornecedor. |
| ENT-13 | M | Dar entrada em estoque fiscal (quando aplicável) e registrar serviços tomados com retenção e responsabilidade tributária. |
| ENT-14 | S | Tratamento de devolução de compra/venda com nota referenciada e reflexo em crédito/débito. |
| ENT-15 | S | Conciliação entre notas recebidas (NF-e/CT-e via NSU da SEFAZ; NFS-e Nacional via “versao” da Focus NF-e) e notas escrituradas, com relatório de pendências (“notas sem manifestação” / “notas não escrituradas”). |


### 6.5 Módulo de Compras


| ID | Prior. | Requisito |
| --- | --- | --- |
| CMP-01 | M | Cadastro e gestão de pedidos de compra (rascunho, aprovado, recebido parcial/total, cancelado). |
| CMP-02 | M | Vínculo pedido → nota de entrada → título financeiro → estoque, com rastreabilidade ponta a ponta. |
| CMP-03 | S | Cotação com múltiplos fornecedores e histórico de preços. |
| CMP-04 | S | Aprovação de compras por alçada (limite por valor/usuário/perfil). |
| CMP-05 | C | Curva ABC de fornecedores e indicadores de prazo/recebimento. |


### 6.6 Módulo de Vendas e Faturamento


| ID | Prior. | Requisito |
| --- | --- | --- |
| VND-01 | M | Pedido/orçamento de venda com cálculo tributário em tempo real (preview de IBS/CBS/IS e tributos em transição) antes do faturamento. |
| VND-02 | M | Faturamento que gera a NF-e/NFS-e e, automaticamente, o título a receber (contas a receber) e a baixa de estoque. |
| VND-03 | M | Tabelas de preço, condições de pagamento e regras comerciais por cliente; bloqueio por inadimplência/limite de crédito (configurável). |
| VND-04 | S | Faturamento parcial, agrupado e recorrente (assinaturas/contratos de serviço). |
| VND-05 | S | Devolução de venda com nota referenciada e ajuste financeiro/estoque. |
| VND-06 | C | Comissionamento de vendedores e metas. |


### 6.7 Módulo Financeiro


Gestão de contas a pagar e a receber, caixa e bancos, conciliação e preparação para o split payment.


#### 6.7.1 Contas a pagar e a receber


| ID | Prior. | Requisito |
| --- | --- | --- |
| FIN-01 | M | Contas a receber: títulos por venda/NFS-e, parcelas, baixas (total/parcial), juros/multa/desconto, renegociação e estorno com auditoria. |
| FIN-02 | M | Contas a pagar: títulos por compra/serviço tomado, agendamento, baixas, retenções e impostos a recolher. |
| FIN-03 | M | Caixa e bancos: contas, saldos, transferências e lançamentos avulsos categorizados (plano de contas gerencial). |
| FIN-04 | M | Fluxo de caixa realizado e projetado, por período, com base em títulos a pagar/receber e recorrências. |
| FIN-05 | S | Conciliação bancária por importação de extrato (OFX/CNAB) e regras de correspondência automática. |
| FIN-06 | S | Geração/baixa de boletos e integração com meios de pagamento (PIX/cartão) por API. |


#### 6.7.2 Preparação para o split payment


No modelo de split payment, parte do valor pago é segregada e recolhida ao Fisco no momento da liquidação financeira, eliminando o intervalo entre receber e recolher. A NT RT 2026.001 institui a vinculação entre o DF-e e a transação de pagamento. Em 2026 o requisito é preparatório; a execução automática evolui conforme a regulamentação de 2027.


| ID | Prior. | Requisito |
| --- | --- | --- |
| FIN-10 | M | Armazenar e relacionar os dados de vinculação DF-e × transação financeira (chave de acesso, meio de pagamento, valores de IBS/CBS) previstos na NT RT 2026.001. |
| FIN-11 | M | Suportar o registro do evento de vinculação da transação de pagamento e o cenário de vinculação anterior à emissão (pagamento iniciado antes do DF-e). |
| FIN-12 | S | Registrar/consultar/cancelar o Evento de Conciliação Financeira (ECONF) da NF-e diretamente na SEFAZ (evento oficial), de uso facultativo, para demonstrar conformidade entre informações financeiras/meios de pagamento e os documentos fiscais. |
| FIN-13 | S | Projeção de caixa com simulação do impacto do split payment (valor líquido recebido vs. bruto) por cenário (padrão/inteligente/superinteligente/simplificado), para planejamento de capital de giro. |
| FIN-14 | C | Integração com PSPs/adquirentes para conciliação do valor segregado, quando a execução automática estiver regulamentada. |


### 6.8 Módulo de Relatórios e Apoio à Apuração


Relatórios mensais fiscais e gerenciais. Todos exportáveis (PDF/XLSX/CSV) e filtráveis por empresa, período, filial, regime e tributo.


#### 6.8.1 Relatórios fiscais mensais


| ID | Prior. | Requisito |
| --- | --- | --- |
| REL-01 | M | Mapa de entradas do mês (notas de entrada e serviços tomados) com totais por CFOP/natureza, fornecedor, tributo (IBS/CBS/IS e ICMS/IPI/PIS/COFINS na transição) e créditos apropriados. |
| REL-02 | M | Mapa de saídas do mês (NF-e e NFS-e emitidas) com totais por natureza, cliente, tributo e débitos gerados. |
| REL-03 | M | Relatório de serviços prestados e de serviços tomados, com retenções (ISS na transição; IBS/CBS no novo modelo) e responsável tributário. |
| REL-04 | M | Resumo de apuração assistida de IBS/CBS: débitos × créditos do período, saldo e memória de cálculo por documento. |
| REL-05 | S | Relatório de divergências fiscais: notas capturadas sem escrituração, sem manifestação, ou com inconsistência de CST/cClassTrib. |
| REL-06 | S | Exportação de dados para obrigações acessórias (SPED) e para o sistema contábil parceiro. |


#### 6.8.2 Relatórios gerenciais


| ID | Prior. | Requisito |
| --- | --- | --- |
| REL-10 | M | Vendas e compras por período, cliente/fornecedor, produto/serviço e vendedor, com comparativos mês a mês. |
| REL-11 | M | Posição financeira: contas a pagar/receber por vencimento (aging), fluxo de caixa e DRE gerencial simplificada. |
| REL-12 | S | Painel (dashboard) com indicadores-chave: faturamento, margem, caixa, inadimplência e carga tributária efetiva. |
| REL-13 | C | Relatórios personalizáveis pelo usuário (construtor de relatórios) e agendamento de envio por e-mail. |


### 6.9 Módulo de Administração, Segurança e Auditoria


| ID | Prior. | Requisito |
| --- | --- | --- |
| ADM-01 | M | Gestão multiempresa: cadastro de empresas/filiais, troca de contexto e segregação total de dados por empresa; para NFS-e via Focus NF-e, provisionamento das empresas no provedor via API de Empresas (com suporte a dry_run). |
| ADM-02 | M | Gestão de usuários, perfis e permissões (RBAC) granulares por módulo/operação; princípio do menor privilégio. |
| ADM-03 | M | Autenticação segura (senha forte + MFA opcional), bloqueio por tentativas, expiração e política de sessão. |
| ADM-04 | M | Trilha de auditoria imutável: quem fez o quê, quando e de onde, para operações fiscais e financeiras sensíveis, incluindo chamadas à SEFAZ (NF-e/recepção) e à Focus NF-e (NFS-e), correlacionadas por identificador de requisição. |
| ADM-05 | M | Gestão de certificados digitais (A1/A3) por empresa: para NF-e (emissão direta), o certificado é custodiado em cofre dedicado do produto e usado para assinatura/transmissão; para NFS-e via Focus NF-e, o certificado é registrado no provedor. Alerta de expiração em ambos os casos. |
| ADM-06 | M | Gestão de credenciais externas: tokens da Focus NF-e por empresa e ambiente (homologação/produção) armazenados em cofre de segredos, com rotação suportada. |
| ADM-07 | M | Gestão de webhooks da Focus NF-e (cadastro, listagem, exclusão, reenvio de notificações); endpoint receptor autenticado e idempotente. |
| ADM-08 | M | Parâmetros fiscais versionados por vigência (alíquotas, CST, cClassTrib, regras), com registro de quem alterou e quando. |
| ADM-09 | S | Notificações/alertas (rejeições SEFAZ/Focus, certificado a expirar, nota sem manifestação, título vencendo, falha de webhook/integração). |
| ADM-10 | S | Backup e retenção: armazenamento próprio de XMLs/DANFEs gerados (emissão direta) e consumo dos backups mensais por CNPJ disponibilizados pela Focus NF-e (NFS-e), com restauração testável e portabilidade de dados. |


## 7. Arquitetura de Emissão Fiscal (Modelo Híbrido)


O produto adota um modelo de emissão fiscal híbrido por tipo de documento. A diretriz estratégica é maximizar autonomia e controle onde o ganho é claro (NF-e modelo 55 — schema padronizado nacionalmente) e delegar a um gateway especializado onde a fragmentação torna a integração direta antieconômica (NFS-e — milhares de prefeituras com regras heterogêneas). Toda a comunicação fiscal — independentemente do caminho — passa por uma camada de integração interna (padrão anticorrupção) que isola o domínio do produto dos detalhes de cada provedor, preservando a opção de evoluir cada caminho de forma independente.


### 7.1 Distribuição dos documentos por caminho de emissão


| Documento / Operação | Caminho | Justificativa |
| --- | --- | --- |
| NF-e modelo 55 (emissão, ciclo de vida, eventos) | Direto SEFAZ | Schema nacional padronizado; volume potencialmente alto; custo unitário e autonomia justificam o investimento próprio. |
| Recepção de NF-e e CT-e contra o CNPJ | Direto SEFAZ (Distribuição de DF-e, NSU) | Serviço oficial estável e padronizado; coerência com a emissão de NF-e. |
| Manifestação do destinatário de NF-e | Direto SEFAZ | Evento oficial da própria NF-e; coerência com a recepção. |
| NFS-e Nacional (DPS) | Focus NF-e | Padrão nacional novo (NT 007/2026) ainda em consolidação; alavancagem da cobertura crescente do provedor. |
| NFS-e municipal (emissores próprios) | Focus NF-e | Centenas de prefeituras com regras particulares; reimplementar é antieconômico e de manutenção contínua. |
| NFS-e Nacional recebidas (serviços tomados) | Focus NF-e | Coerência com a emissão de NFS-e. |
| ECONF (Conciliação Financeira) e demais eventos fiscais | Direto SEFAZ | Eventos vinculados à NF-e; coerência com o caminho da emissão. |
| NFC-e, CT-e, MDF-e, NFCom (futuro) | A definir | Decisões a tomar quando entrarem no escopo; arquitetura preserva ambas as opções. |


### 7.2 Camada de integração fiscal (anticorrupção)


O domínio do produto fala com uma interface única — EmissorFiscal — que abstrai o caminho de emissão. Por trás dela há dois adaptadores principais: um adaptador SEFAZ (NF-e e recepção de DF-e) e um adaptador Focus NF-e (NFS-e). Esse desenho é deliberado e não negociável; ele preserva três propriedades essenciais.

- **Independência do domínio: **regras de negócio, modelo de dados, interface e relatórios não conhecem o caminho de emissão. Trocar de provedor de NFS-e, internalizar NFS-e municipal em uma cidade específica ou adicionar contingência futura não exige mudanças no domínio.
- **Portabilidade testável: **testes de contrato e fitness functions garantem que nenhuma regra fiscal vaze para dentro do adaptador (responsabilidade do adaptador é apenas tradução de formato e comunicação).
- **Evolução por caminho: **o caminho SEFAZ direto e o caminho Focus podem evoluir, ter releases e janelas de manutenção independentes; uma rejeição da SEFAZ não afeta a NFS-e e vice-versa.

### 7.3 Emissão direta SEFAZ — NF-e modelo 55 e recepção


A comunicação com a SEFAZ é feita via web services SOAP oficiais publicados por cada UF autorizadora (e ambiente nacional quando aplicável). O produto implementa o ciclo completo: composição do XML conforme schema, validação local (XSD + regras numeradas das Notas Técnicas), assinatura digital, transmissão, tratamento de retorno, eventos e contingência.


| ID | Prior. | Requisito |
| --- | --- | --- |
| SEF-01 | M | Comunicação SOAP com os web services da SEFAZ autorizadora de cada UF (NfeAutorizacao, NfeRetAutorizacao, NfeConsultaProtocolo, NfeStatusServico, NFeDistribuicaoDFe, RecepcaoEvento), com roteamento por UF do emitente e por ambiente (homologação/produção). |
| SEF-02 | M | Validação local do XML contra o XSD vigente (NF-e versão 4.00 + ajustes da Reforma) e contra as regras numeradas das Notas Técnicas (ex.: validações de IBS/CBS/IS introduzidas pela RT 2025.002) antes da transmissão. |
| SEF-03 | M | Assinatura digital do XML conforme XML-DSig com canonicalização e referência corretas, usando o certificado A1/A3 do emitente custodiado em cofre dedicado pelo produto. |
| SEF-04 | M | Custódia segura do certificado digital: armazenamento em cofre, isolamento por empresa, controle de acesso, registro de uso, rotação e alerta de expiração. |
| SEF-05 | M | Tratamento dos códigos de status (cStat) da SEFAZ — autorização (100), em processamento (105), denegada, rejeições — com mensagens traduzidas/explicadas ao usuário e ação corretiva sugerida; cobertura especial da faixa ampliada introduzida pela Reforma (IBS/CBS/IS). |
| SEF-06 | M | Contingência fiscal conforme regras vigentes: EPEC (Evento Prévio de Emissão em Contingência) e SVC-AN/SVC-RS quando autorizadores principais estiverem indisponíveis; controle de numeração própria e reprocessamento posterior; sem perda de notas e sem duplicidade. |
| SEF-07 | M | Distribuição de DF-e para recepção de NF-e/CT-e destinados ao CNPJ: consulta incremental por Último NSU (ultNSU), persistência do cursor por CNPJ, paginação e armazenamento do XML/resumo retornado pela SEFAZ. |
| SEF-08 | M | Manifestação do destinatário pelos eventos oficiais da NF-e (ciência, confirmação com justificativa, desconhecimento, operação não realizada). |
| SEF-09 | M | Eventos da NF-e (Cancelamento, CC-e até 20 correções, Ator Interessado, Insucesso na Entrega, ECONF, novos eventos da Reforma quando publicados), com regras de prazo, justificativa e auditoria. |
| SEF-10 | M | Inutilização de faixa de numeração quando necessário, com auditoria e justificativa formal. |
| SEF-11 | M | Atualização periódica dos schemas (XSD), tabelas oficiais (CST, cClassTrib, NCM, CFOP, CEST, IBGE, lista de serviços) e regras de validação conforme novas Notas Técnicas; processo de homologação antes de cada release de conformidade. |
| SEF-12 | S | Painel operacional de SEFAZ: status de cada UF, fila de transmissão, taxa de rejeição por motivo, alertas de contingência, latência. |


**Decisão pendente — biblioteca/abordagem para a integração SEFAZ: ** *(a) avaliar ACBr (referência de mercado, com forte tração em Delphi e bindings para outras plataformas) — ganho de aproveitamento de conhecimento da equipe legada; (b) implementação própria do zero na stack nova — controle total e independência. A decisão depende da stack escolhida para a aplicação nova e será registrada no documento de arquitetura técnica. O PRD não constrange essa escolha.*


### 7.4 Emissão via gateway Focus NF-e — NFS-e


A emissão de NFS-e (padrão nacional via DPS e padrão municipal para prefeituras ainda não migradas) é feita pela API REST da Focus NF-e, com modelo assíncrono (pré-validação síncrona do payload + processamento assíncrono na prefeitura/ambiente nacional) e notificação por webhook. O certificado digital, quando exigido pela prefeitura/ambiente nacional, fica registrado no provedor.


| ID | Prior. | Requisito |
| --- | --- | --- |
| FNF-01 | M | Adaptador da API REST Focus NF-e isolado na camada de integração, com mapeamento explícito entre o modelo de domínio do produto e os campos do provedor. |
| FNF-02 | M | Suporte aos dois ambientes (homologação e produção) por empresa, com tokens distintos armazenados em cofre de segredos. |
| FNF-03 | M | Endpoint receptor de webhooks autenticado, idempotente e tolerante a reentrega/duplicidade; processamento assíncrono interno. |
| FNF-04 | M | Fallback de polling (consulta agendada) quando o webhook não chegar dentro do SLA esperado, incluindo solicitação de reenvio de notificação ao provedor. |
| FNF-05 | M | Roteamento automático NFS-e Nacional × NFS-e municipal por município, conforme a cobertura do provedor; tratamento de campos da Reforma marcados como “(RT)” com degradação segura quando o município não os aceita. |
| FNF-06 | M | Captura de NFS-e Nacional recebidas via cursor incremental (“versao” + cabeçalhos X-Total-Count/X-Max-Version) para serviços tomados. |
| FNF-07 | M | Provisionamento e atualização das empresas no provedor via API de Empresas (com dry_run para simulação). |
| FNF-08 | S | Uso pontual das consultas auxiliares da Focus NF-e (CEP, CFOP, CNAE, CNPJ, NCM, municípios IBGE, códigos tributários municipais, itens da lista de serviço) como uma das fontes de alimentação do cache de tabelas oficiais. |


### 7.5 Propriedades transversais à camada de integração


| ID | Prior. | Requisito |
| --- | --- | --- |
| INT-01 | M | Camada de integração fiscal (anticorrupção) única para todos os caminhos; o domínio fala com uma interface EmissorFiscal abstrata. |
| INT-02 | M | Identificador único próprio por documento (chave de idempotência) para evitar emissão/duplicidade em caso de timeout, retransmissão ou reentrega de webhook, em qualquer caminho. |
| INT-03 | M | Máquina de estados do documento (rascunho → enviado → processando → autorizado/rejeitado/denegado → cancelado) unificada entre os caminhos; a consulta oficial é a fonte de verdade em caso de divergência com webhook ou cache. |
| INT-04 | M | Fila com retentativa e backoff e disjuntor (circuit breaker) para indisponibilidade de qualquer caminho (SEFAZ ou Focus NF-e), sem perder solicitações nem duplicar notas. |
| INT-05 | M | Reconciliação periódica: para cada documento sem confirmação e para os cursores de recepção (NSU SEFAZ e “versao” Focus NF-e), consultar ativamente e fechar pendências. |
| INT-06 | M | Tratamento padronizado de erros: distinguir erro de validação (corrigível pelo usuário), rejeição oficial (SEFAZ/prefeitura), indisponibilidade transitória (retentativa) e erro de integração; mensagens traduzidas. |
| INT-07 | S | Observabilidade da integração: log estruturado correlacionado por requisição, métricas de latência e sucesso por caminho/endpoint, painel de filas/rejeições/webhooks. |
| INT-08 | S | Testes de contrato e fitness functions para garantir que nenhuma regra de negócio vaze do domínio para os adaptadores (preservando portabilidade). |


### 7.6 Implicações da decisão híbrida

- **Maior autonomia e menor custo unitário na NF-e: **o produto controla numeração, contingência, eventos e ciclo de vida sem depender de terceiro e sem custo por nota; em volume médio-alto, isso é financeiramente relevante.
- **Tempo de entrega da Fase 1 ampliado: **o esforço para implementar comunicação SOAP, assinatura, validação completa, contingência e custódia de certificado é significativo. O roadmap (Seção 12) reflete essa ampliação.
- **Exigência maior de conhecimento fiscal interno: **a equipe acompanha Notas Técnicas direto da fonte (Portal Nacional da NF-e), não via changelog de provedor, e precisa ser capaz de depurar rejeições da SEFAZ a partir do XML bruto.
- **Custo de NFS-e contido pela Focus NF-e: **a alternativa de implementar prefeitura por prefeitura seria de manutenção contínua sem fim; o gateway resolve isso por valor previsível.
- **Risco residual de dependência: **permanece para NFS-e, mas é proporcionalmente menor e a camada anticorrupção preserva a opção de trocar de provedor ou internalizar municípios estratégicos no futuro.
- **Coexistência operacional: **dois caminhos significam dois conjuntos de regras a acompanhar e duas integrações a manter; a observabilidade unificada (INT-07) é o que torna a operação sustentável.

## 8. Requisitos Não Funcionais


### 8.1 Desempenho e escalabilidade


| ID | Prior. | Requisito |
| --- | --- | --- |
| RNF-01 | M | Composição e submissão de NF-e/NFS-e ao caminho de emissão (SEFAZ direto para NF-e; Focus NF-e para NFS-e) com tempo de resposta percebido ≤ 5 s, excluída a latência de processamento do autorizador; resultado final acompanhado de forma assíncrona/por consulta. |
| RNF-02 | M | Suportar, no mínimo, o pico de emissão e o volume mensal atuais do legado com folga de 3× para crescimento. |
| RNF-03 | S | Processamento assíncrono para lotes, importações e tratamento de webhooks/distribuição de DF-e, sem bloquear a interface. |


### 8.2 Disponibilidade e resiliência


| ID | Prior. | Requisito |
| --- | --- | --- |
| RNF-04 | M | Disponibilidade ≥ 99,5% mensal das funções do produto; degradação graciosa quando a SEFAZ ou a Focus NF-e estiverem indisponíveis (fila + contingência), conforme INT-04/INT-05. |
| RNF-05 | M | Recuperação: RPO ≤ 15 min e RTO ≤ 4 h; backups automáticos com teste periódico de restauração. |
| RNF-06 | M | Idempotência fim a fim das operações fiscais (ver INT-02), em qualquer caminho, sem duplicar notas/numeração em reprocessamentos. |
| RNF-07 | M | Cada caminho fiscal é dependência crítica em sua faixa de responsabilidade: monitoramento ativo de saúde/latência (SEFAZ por UF; Focus NF-e por endpoint), alertas e SLA contratual com o provedor; a camada anticorrupção preserva a possibilidade de evoluir/substituir cada caminho independentemente. |


### 8.3 Segurança e privacidade (LGPD)


| ID | Prior. | Requisito |
| --- | --- | --- |
| RNF-08 | M | Criptografia em trânsito (TLS) e em repouso para dados sensíveis (certificados, tokens, dados pessoais e financeiros). |
| RNF-09 | M | Aderência à LGPD: base legal, minimização, retenção definida, atendimento a titulares e registro de tratamento; dados de terceiros usados apenas para fins fiscais. |
| RNF-10 | M | Gestão de credenciais: certificado digital (A1/A3) das empresas custodiado em cofre dedicado do produto para emissão de NF-e (uso restrito à assinatura/transmissão e auditado); tokens da Focus NF-e em cofre, com menor privilégio e rotação; certificado registrado no provedor para NFS-e quando exigido. |
| RNF-11 | M | Trilha de auditoria à prova de adulteração e segregação de funções para operações críticas (emissão, cancelamento, manifestação, alteração de parâmetro fiscal, acesso ao certificado). |


### 8.4 Usabilidade, observabilidade e manutenibilidade


| ID | Prior. | Requisito |
| --- | --- | --- |
| RNF-12 | M | Interface web responsiva, em português (pt-BR), com fluxos otimizados para alto volume de emissão (atalhos, reaproveitamento de notas). |
| RNF-13 | M | Mensagens de erro fiscais traduzidas/explicadas (não apenas o código bruto da SEFAZ ou da Focus NF-e), com ação corretiva sugerida. |
| RNF-14 | M | Observabilidade: logs estruturados, métricas e tracing, com painel unificado dos dois caminhos fiscais (ver INT-07). |
| RNF-15 | M | Regras tributárias atualizáveis por configuração/pacote de parâmetros, sem novo deploy de código sempre que possível. |
| RNF-16 | S | Internacionalização de dados (multimoeda apenas se houver comércio exterior — fora do escopo inicial). |


### 8.5 Compatibilidade e integração


| ID | Prior. | Requisito |
| --- | --- | --- |
| RNF-17 | M | API documentada (REST) do próprio produto para integrações futuras (contabilidade, e-commerce, BI). |
| RNF-18 | M | Integração SEFAZ: aderência aos web services SOAP oficiais (cada UF autorizadora e ambiente nacional), com camada de adaptação encapsulando UFs e versões de schema. |
| RNF-19 | M | Integração Focus NF-e: REST versionada, encapsulada por adaptador na camada anticorrupção (ver INT-01), com versionamento do contrato e testes de contrato automatizados. |
| RNF-20 | S | Compatibilidade com navegadores modernos; sem dependência de plugins legados. |


## 9. Conformidade Fiscal e Roadmap Regulatório


Esta seção conecta o cronograma da Reforma (Seção 2.3) às entregas do produto. A premissa de engenharia é tratar conformidade como um fluxo contínuo: as Notas Técnicas são revisadas periodicamente e o produto deve absorver mudanças por configuração e por releases planejados.


**No modelo híbrido, **a conformidade da NF-e depende diretamente do acompanhamento das Notas Técnicas e da atualização de schemas e regras de validação pela equipe interna; a conformidade da NFS-e depende também do roadmap da Focus NF-e e da cobertura/aceitação dos campos pelos municípios. O processo de monitoramento normativo precisa cobrir ambas as frentes.


| Janela | Capacidade que o produto deve ter | Status alvo |
| --- | --- | --- |
| 2026 (ano-teste) | Emitir NF-e (RT 2025.002) direto na SEFAZ e NFS-e (NT 007/2026) via Focus NF-e, com grupos/campos de IBS/CBS preenchidos e validados; convivência com tributação antiga; sem recolhimento dos novos tributos; recepção de DF-e por NSU e manifestação na SEFAZ. | Entregar no MVP |
| 2027 | CBS plena (apuração efetiva); fim de PIS/COFINS; IS ativo; obrigatoriedade estendida a Simples/MEI; suporte ao split payment (vinculação DF-e × pagamento; evento ECONF da SEFAZ). | Release de conformidade 2027 |
| 2028 | Estabilização da CBS/IS; refinamentos de apuração assistida. | Manutenção evolutiva |
| 2029–2032 | Operação simultânea de IBS (crescente) e ICMS/ISS (decrescente) com alíquotas proporcionais por vigência. | Releases anuais de transição |
| 2033 | Operação somente no IVA Dual; tributos antigos apenas em histórico. | Release de consolidação |


**Princípios de conformidade: **(1) parâmetros tributários versionados por data de vigência e por Nota Técnica; (2) validador de pré-emissão local (XSD + regras numeradas) para o caminho SEFAZ, somado à pré-validação síncrona da Focus NF-e no caminho NFS-e; (3) ambiente de homologação espelhando produção em ambos os caminhos; (4) processo formal de monitoramento normativo (e do roadmap da Focus NF-e para NFS-e) com SLA de atualização; (5) modo de simulação para validar mudanças antes da vigência.


## 10. Arquitetura de Referência e Estratégia de Migração do Legado


Esta seção é orientativa (o detalhamento técnico será objeto de um documento de arquitetura) e complementa a Seção 7, que trata especificamente da emissão fiscal híbrida.


### 10.1 Diretrizes de arquitetura

- Banco de dados relacional transacional (ACID) substituindo BDE/Paradox; fim do compartilhamento de arquivos em rede e dos arquivos de lock.
- Aplicação em camadas com API; interface web multiusuário; serviços fiscais isolados (emissão NF-e SEFAZ, recepção DF-e, emissão NFS-e Focus) atrás da camada anticorrupção (Seção 7).
- Motor tributário dirigido por dados/configuração, com versionamento por vigência — requisito central dada a transição plurianual.
- Filas e processamento assíncrono para submissão a cada caminho, tratamento de webhooks (Focus NF-e) e distribuição de DF-e (SEFAZ); idempotência por chave própria.
- Multiempresa com isolamento lógico de dados; segredos (certificados próprios; tokens Focus NF-e) em cofre dedicado, com acesso auditado.
- Observabilidade nativa (logs, métricas, tracing) e ambientes segregados (dev/homologação/produção) alinhados aos ambientes oficiais (SEFAZ homologação/produção; Focus NF-e homologação/produção).

### 10.2 Estratégia de migração

1. Inventário e mapeamento das tabelas Paradox e regras embutidas no legado; identificação de dados fiscais obrigatórios para histórico.
1. Extração e saneamento dos dados (cadastros, notas históricas, títulos, saldos), com dicionário de-para e tratamento de inconsistências.
1. Carga no novo modelo com reconciliação automatizada (totais por período, contagem de documentos, saldos financeiros) — meta de 100% conciliado.
1. Provisionamento das empresas na Focus NF-e (API de Empresas, com dry_run) para NFS-e; cadastro/configuração dos certificados próprios do produto para emissão NF-e; validação em ambientes de homologação antes da virada.
1. Operação assistida em paralelo por um período de corte (legado em modo consulta), com critérios objetivos de aceite antes do desligamento; plano de rollback e contingência.

**Risco específico do legado: **a fragilidade de Paradox (corrupção/locks) reforça a urgência da migração e exige validação rigorosa da integridade dos dados extraídos antes da carga.


### 10.3 Stack tecnológica e decisões de modelagem


A escolha da stack é orientada a três fatores principais: solidez transacional para operação fiscal, suporte robusto a tipos numéricos (Decimal) sem perda de precisão, e capacidade de evoluir o schema com segurança durante anos de transição regulatória.


| Componente | Tecnologia | Justificativa |
| --- | --- | --- |
| Banco de dados | PostgreSQL | Banco relacional transacional ACID com suporte nativo a Decimal de precisão arbitrária (essencial para tributação), JSON, enums, partial indexes e particionamento. Substitui o Paradox/BDE com ganho substancial em integridade e operação multiusuário. |
| ORM e camada de acesso | Prisma ORM | Type-safety end-to-end, migrações declarativas com versionamento, modelagem direta no schema.prisma, geração de tipos para o código de aplicação. Reduz erros de mapeamento entre domínio e banco. |
| Stack de aplicação | A definir no documento de arquitetura técnica | Decisão pendente, atrelada ao perfil da equipe e a integrações futuras. O PRD não constrange essa escolha. |


Princípios de modelagem aplicados no schema:

- Valores monetários sempre em Decimal (18, 2) ou (18, 6); nunca Float — erros de arredondamento em ponto flutuante geram rejeições fiscais.
- Multiempresa real: toda tabela transacional carrega companyId com índice composto; agrupamento por Tenant para holdings e SaaS futuro.
- Parâmetros tributários e regras versionados por data de vigência (validFrom/validTo) — base para operar regime antigo e Reforma em paralelo até 2033.
- Idempotência fim a fim em documentos fiscais (idempotencyKey único), eliminando duplicação por timeout ou reentrega de webhook.
- Segredos (certificados digitais e tokens externos) em cofre dedicado; o banco guarda apenas referências opacas (vaultRef).
- Auditoria imutável (AuditLog append-only) para operações fiscais e financeiras sensíveis.
- Soft delete em cadastros (Customer, Supplier, Product, Service); documentos fiscais nunca são excluídos — transitam por estados (CANCELLED, INUTILIZED) conforme exige a legislação.
- Schema fiscal completo + parametrização por empresa via flags (ver 6.1.1), permitindo que empresas de perfis muito diferentes coexistam sem migrações nem código condicional.

**Próximos artefatos técnicos derivados deste PRD: **(1) schema Prisma completo (já produzido e versionado junto do projeto); (2) documento de arquitetura técnica com a stack de aplicação, organização em camadas e padrões de integração; (3) plano de seed das tabelas globais oficiais (alíquotas interestaduais, internas por UF, MVA, benefícios fiscais).


## 11. Riscos e Mitigações


| Risco | Prob. | Impacto | Mitigação |
| --- | --- | --- | --- |
| Cronograma da Fase 1 ampliado pela emissão direta NF-e (assinatura, validação, contingência, certificado, NSU) | Alta | Alto | Faseamento explícito da Fase 1 (Seção 12); homologação contínua; avaliação de aproveitar bibliotecas maduras (ACBr) na decisão técnica; reservar capacidade fiscal sênior na equipe. |
| Erros sutis de assinatura XML-DSig / canonicalização gerando rejeição em massa | Média | Alto | Testes automatizados contra schemas e exemplos da SEFAZ; validador de pré-emissão local; ambiente de homologação espelhando produção; revisão por especialista fiscal sênior. |
| Mudanças frequentes em Notas Técnicas, schemas e tabelas oficiais durante a transição | Alta | Alto | Motor parametrizável por vigência; processo de monitoramento normativo com SLA; pacote de atualizações sem deploy quando possível. |
| Indisponibilidade prolongada de SEFAZ autorizadora (ponto único na emissão de NF-e por UF) | Média | Alto | Contingência (EPEC/SVC) implementada (SEF-06), fila com retentativa, alertas e procedimento operacional documentado. |
| Vazamento/uso indevido do certificado digital agora custodiado pelo produto | Baixa | Crítico | Cofre de segredos com controle de acesso, registro de uso, isolamento por empresa, rotação, segregação de funções e revisão de segurança periódica. |
| Indisponibilidade ou degradação da Focus NF-e (afeta NFS-e) | Média | Médio | Fila com retentativa, reconciliação ativa (INT-04/INT-05), alertas e SLA contratual; camada anticorrupção preserva troca de provedor. |
| Cobertura incompleta de municípios e campos da Reforma na NFS-e via Focus NF-e | Alta | Médio | Roteamento automático Nacional × municipal; degradação segura; acompanhamento da lista de municípios e do roadmap do provedor. |
| Indefinições regulatórias (split payment, alíquotas finais, novos eventos) | Alta | Médio | Tratar como configuração; entregar preparatório (ECONF) e evoluir por release; não hard-codar alíquotas. |
| Perda/inconsistência de dados na migração do Paradox | Média | Alto | Saneamento, reconciliação automatizada, operação paralela e rollback. |
| Duplicidade de emissão por timeout/reentrega de webhook ou reenvio à SEFAZ | Média | Alto | Chave de idempotência (INT-02), reserva transacional de numeração e reconciliação ativa. |
| Classificação tributária incorreta (CST/cClassTrib) com efeito em cadeia | Média | Alto | Validador de pré-emissão, conferência fiscal obrigatória, auditoria. |
| Conhecimento fiscal interno insuficiente para depurar SEFAZ | Média | Alto | Reforço de senioridade fiscal/desenvolvimento, formação, parceria com contabilidade, base de conhecimento de rejeições. |
| Impacto de caixa do split payment não previsto pela empresa | Média | Alto | Simulador de fluxo de caixa por cenário para planejamento antecipado de capital de giro. |


## 12. Roadmap de Entregas (Fases)


Faseamento orientado a valor e a risco regulatório. A Fase 1 está ampliada em relação à versão 1.1 do PRD porque a emissão direta de NF-e (SEFAZ) entra desde o MVP — decisão estratégica registrada na Seção 7. Datas a definir no planejamento; o MVP fiscal deve estar operacional ainda dentro do ano-teste de 2026.


| Fase | Conteúdo | Resultado |
| --- | --- | --- |
| Fase 0 — Fundamentos | Arquitetura, banco relacional, autenticação/RBAC, multiempresa, cadastros base, motor tributário parametrizável, camada anticorrupção, cofre de segredos, fila/observabilidade. | Base técnica e cadastral pronta para os dois caminhos fiscais. |
| Fase 1a — Núcleo SEFAZ (NF-e) | Adaptador SEFAZ: composição do XML, validação XSD, assinatura XML-DSig, transmissão por UF, tratamento de retornos, ciclo de vida (cancelamento, CC-e, inutilização), eventos da NF-e, contingência (EPEC/SVC), validador de pré-emissão com regras IBS/CBS/IS (RT 2025.002), custódia de certificado. | NF-e emitida em homologação e produção. |
| Fase 1b — Recepção SEFAZ + NFS-e Focus | Distribuição de DF-e por NSU, manifestação do destinatário, importação por XML/PDF; adaptador Focus NF-e para NFS-e Nacional e municipal (DPS, IBS/CBS, webhooks, polling de fallback, recebidas). | Recepção de entradas e emissão de NFS-e funcionais. |
| Fase 1c — MVP Fiscal completo (ano-teste) | Relatórios mensais de entradas/saídas e serviços; conferência humana; modo “ano-teste” 2026; auditoria; alertas operacionais. | Conformidade 2026; substituição do núcleo fiscal do legado. |
| Fase 2 — Comercial e Financeiro | Vendas, compras, contas a pagar/receber, fluxo de caixa, conciliação; relatórios gerenciais; ECONF. | Operação integrada ponta a ponta. |
| Fase 3 — Migração e corte | Migração do legado, operação paralela, reconciliação e desligamento do sistema antigo. | Legado descontinuado. |
| Fase 4 — Conformidade 2027+ | CBS plena, IS, fim de PIS/COFINS, split payment, ampliação a Simples/MEI; transição 2029–2033. | Conformidade contínua e melhorias. |


## 13. Dependências e Restrições

- Disponibilidade e estabilidade dos web services oficiais da SEFAZ (autorizadoras de cada UF, ambiente nacional, contingência SVC) e do ambiente nacional da NFS-e.
- Focus NF-e como gateway de NFS-e: disponibilidade, SLA, cobertura de municípios e ritmo de exposição dos campos da Reforma.
- Publicação tempestiva de Notas Técnicas, schemas, tabelas (NCM, CFOP, CST, cClassTrib, IBGE, lista de serviços) pelos órgãos competentes.
- Certificados digitais válidos por empresa, custodiados no produto (NF-e) e provisionados na Focus NF-e (NFS-e quando exigido); definição da estratégia de obrigações acessórias (SPED) com a contabilidade.
- Disponibilidade dos dados do legado para extração e do conhecimento de negócio para validação das regras migradas.
- **Decisões pendentes registradas: **(a) biblioteca/abordagem para a integração SEFAZ — ACBr × implementação própria, a definir conforme a stack escolhida; (b) escopo de outros DF-e (NFC-e/CT-e/MDF-e/NFCom/DCe) em releases futuros; (c) profundidade de SPED nativo; (d) integração com PSPs para split payment.

## 14. Glossário


| Termo | Definição |
| --- | --- |
| Camada anticorrupção | Adaptador que isola o modelo do produto dos detalhes de provedores externos, reduzindo acoplamento e lock-in. |
| SEFAZ | Secretaria da Fazenda; cada UF possui ambiente autorizador próprio para NF-e, além do ambiente nacional. |
| XML-DSig | Assinatura digital de XML conforme padrão W3C; usada para assinar o XML da NF-e antes da transmissão à SEFAZ. |
| XSD | XML Schema Definition; define a estrutura e tipos dos XMLs fiscais (NF-e versão 4.00 e ajustes da Reforma). |
| cStat | Código de status retornado pela SEFAZ (ex.: 100 = autorizada, 105 = em processamento, 110+ = rejeições). |
| NSU | Número Sequencial Único; cursor usado no serviço de Distribuição de DF-e da SEFAZ para recepção incremental. |
| EPEC / SVC-AN / SVC-RS | Mecanismos oficiais de contingência da NF-e quando a SEFAZ autorizadora principal está indisponível. |
| ACBr | Componentes Brasil para automação fiscal — biblioteca de mercado, com forte tração em Delphi e suporte multi-plataforma. |
| Focus NF-e | Provedor de gateway fiscal acessível por API REST, adotado pelo produto para NFS-e (Nacional e municipal). |
| Webhook (gatilho) | Notificação HTTP enviada por um provedor externo ao produto quando um evento ocorre. |
| Idempotência | Propriedade pela qual repetir uma requisição não gera efeito duplicado (ex.: não emitir a mesma nota duas vezes). |
| EC 132/2023 | Emenda Constitucional que instituiu a Reforma Tributária do Consumo. |
| LC 214/2025 | Lei Complementar que regulamenta IBS, CBS e Imposto Seletivo (alterada por normas posteriores, p.ex. LC 227/2026). |
| IVA Dual | Modelo com dois tributos sobre valor agregado: CBS (federal) e IBS (estadual/municipal). |
| CBS / IBS / IS | Contribuição sobre Bens e Serviços / Imposto sobre Bens e Serviços / Imposto Seletivo. |
| NF-e modelo 55 | Nota Fiscal Eletrônica de produtos/operações com mercadorias. |
| NFS-e | Nota Fiscal de Serviço Eletrônica (padrão nacional e/ou municipal). |
| DPS | Declaração de Prestação de Serviços, base para a emissão da NFS-e Nacional. |
| DF-e | Documento Fiscal Eletrônico (termo genérico que abrange NF-e, NFS-e, CT-e e outros). |
| CST / cClassTrib | Código de Situação Tributária e Código de Classificação Tributária de IBS/CBS, por item. |
| cIndOp / indZFMALC | Indicador de operação da DPS / indicador de operação com CBS alíquota zero (ZFM/ALC). |
| CRT | Código de Regime Tributário do emitente (1=Simples, 2=excesso sublimite, 3=regime normal, 4=MEI). |
| ECONF | Evento de Conciliação Financeira (facultativo) registrado na SEFAZ; apoia a preparação ao split payment. |
| Manifestação do destinatário | Resposta do destinatário a uma nota emitida contra ele (ciência, confirmação, desconhecimento, operação não realizada). |
| DANFE / DANFSe | Representação impressa/visual da NF-e / NFS-e. |
| Split payment | Recolhimento do tributo segregado no momento da liquidação financeira da operação. |
| ZFM / ALC | Zona Franca de Manaus / Áreas de Livre Comércio. |
| RBAC | Controle de acesso baseado em papéis. |
| RPO / RTO | Objetivo de ponto de recuperação / objetivo de tempo de recuperação. |
| DIFAL | Diferencial de Alíquotas — diferença entre a alíquota interna do estado de destino e a alíquota interestadual, recolhida ao estado de destino em operações interestaduais com consumidor final (EC 87/2015, LC 190/2022). |
| FCP | Fundo de Combate à Pobreza — adicional de 1% a 4% sobre certos produtos, instituído por algumas UFs. |
| ICMS-ST | ICMS por Substituição Tributária — recolhimento antecipado do ICMS devido nas operações subsequentes da cadeia, pelo substituto tributário (em geral, indústria ou importador). |
| MVA | Margem de Valor Agregado — percentual aplicado para presumir o preço de venda final ao consumidor no cálculo do ICMS-ST. Pode ser original (interna) ou ajustada (interestadual, conforme Convênio ICMS 35/2011). |
| CST / CSOSN | Código de Situação Tributária (regime normal) / Código de Situação da Operação no Simples Nacional. Identificam, junto com o cClassTrib na Reforma, o tratamento tributário aplicável ao item. |
| cBenef | Código de Benefício Fiscal — identifica isenções, reduções e créditos presumidos concedidos por UF, preenchido em campos específicos do XML da NF-e. |
| Resolução Senado 22/89 e 13/2012 | Normas que estabelecem as alíquotas interestaduais de ICMS (7% / 12% para mercadorias nacionais; 4% para importadas). |
| Convênio ICMS 35/2011 | Convênio do Confaz que estabelece o cálculo da MVA ajustada para operações interestaduais sujeitas a Substituição Tributária. |
| PostgreSQL | Sistema de gerenciamento de banco de dados relacional ACID escolhido para o produto. |
| Prisma ORM | Ferramenta de modelagem de dados type-safe escolhida para o produto. Provê migrações declarativas e geração de tipos para a aplicação. |


## 15. Referências Normativas e Técnicas


Base normativa e técnica consultada para os requisitos (verificar sempre a versão mais recente nos portais oficiais e na documentação dos provedores antes da implementação):

- Emenda Constitucional nº 132/2023 — Reforma Tributária do Consumo.
- Lei Complementar nº 214/2025 (e alterações posteriores, p.ex. LC nº 227/2026) — regulamentação de IBS, CBS e IS.
- Nota Técnica RT 2025.002 (NF-e/NFC-e) — adequação dos layouts a IBS/CBS/IS; substitui a RT NT 2024.002 e versões anteriores; Informe Técnico RT 2025.002 com as tabelas de CST e cClassTrib (Portal Nacional da NF-e — nfe.fazenda.gov.br).
- Manual de Orientação do Contribuinte (MOC) da NF-e e Notas Técnicas correlatas (contingência, eventos, distribuição de DF-e) — Portal Nacional da NF-e.
- Nota Técnica SE/CGNFS-e nº 007/2026 — atualização do layout da NFS-e Nacional (grupos de IBS/CBS, cIndOp, indZFMALC, tratamento de PIS/COFINS/CSLL) e anexos correlatos.
- Nota Técnica RT 2026.001 — vinculação entre Documento Fiscal Eletrônico e transação de pagamento (split payment).
- Orientações da Receita Federal sobre a entrada em vigor de CBS/IBS em 2026 e o cronograma de transição até 2033; documentação técnica da NFS-e Nacional (gov.br/nfse).
- Documentação da API Focus NF-e — https://doc.focusnfe.com.br/ (endpoints de NFS-e/NFS-e Nacional, documentos recebidos, webhooks, empresas e consultas auxiliares); referência de campos em campos.focusnfe.com.br; guia da Reforma Tributária e lista de municípios integrados do provedor.
- Projeto ACBr — bibliotecas de automação fiscal (a avaliar como alternativa de implementação da integração SEFAZ).

**Observação final: ** *este PRD descreve “o quê” e o “porquê”. As especificações de leiaute (nomes exatos de grupos/campos, schemas, regras de validação e prazos técnicos) e os contratos exatos das integrações (SEFAZ e Focus NF-e) devem ser extraídos das Notas Técnicas oficiais e da documentação dos provedores vigentes na fase de implementação de cada release, dado o caráter dinâmico da regulamentação durante a transição.*

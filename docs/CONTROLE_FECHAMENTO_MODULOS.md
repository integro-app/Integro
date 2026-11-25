# ÍNTEGRO — CONTROLE OFICIAL DE FECHAMENTO DOS MÓDULOS

**Criado em:** 06/11/2026  
**Referência funcional obrigatória:** [ESPECIFICACAO_MESTRA_INTEGRO.md](ESPECIFICACAO_MESTRA_INTEGRO.md)  
**Propósito:** conduzir o projeto por **um tópico ativo de cada vez**; não sair do tópico sem 100% de aceite verificável.

> **Marco inicial: 0 de 22 módulos formalmente fechados segundo o novo protocolo.** Isso **não** significa que o código de todos esteja incompleto. Significa que nenhum dos 22 recebeu, nesta nova matriz, um dossiê completo de testes, publicação, homologação real e aceite registrado.

## 1. Estado de execução

- **Tópico ativo:** **M02 — Empresas/multiempresa**, com prioridade no isolamento entre empresas e no vínculo de usuários. **M01 permanece preservada em homologação**, com entrega operacional aprovada e testes reais pendentes. M22 continua com pendências próprias, sem aceite formal. Histórico anterior: **M22 — Navegação do vendedor / Operação: Cobranças e Vendas**. Em 12/11/2026, correções adicionais estão na branch `fix/m22-operacao-vendedor-permissoes-abas-20261112` com CI aprovado (59/59 testes focados e 596/596 gerais). Faltam revisão, publicação autorizada e homologação real desktop/mobile; **NÃO FECHADO**.
- **Próxima prioridade sugerida pela auditoria:** **M12 — Caixas operacionais**, começando pelo fechamento, persistência do status e disponibilidade dos botões. Risco crítico para uso real.
- **Dependências críticas:** M03 Login, M02 Multiempresa, M05 Permissões, M11 Pagamentos e M13 Ledger. Podem ser inspecionadas para validar M12, mas não serão declaradas concluídas automaticamente.
- **Mudanças de escopo:** só por solicitação do proprietário ou bloqueador P0 evidenciado no tópico ativo.
- **Política de regressão:** 'não mexer no que já funciona'; mudanças mínimas, integradas, com verificação técnica e funcional antes de concluir.

### Marco M02 — Segurança multiempresa publicada (16/11/2026)

- **Produção:** PR #49 incorporado no commit `27cff25d383aad7e9ef729ed1f1b34263a9c5ead`. Workflow [#43994254475](https://github.com/integro-app/Integro/actions/runs/43994254475) concluiu com sucesso a publicação de `firestore.rules` no Firebase `integro-novo`.
- **Confirmação remota:** release `cloud.firestore` atualizada para o ruleset `projects/integro-novo/rulesets/effcd088-f8c4-46ac-b221-7d9e9a3054be`, SHA-256 `190a6e3c7fb3ba5574cd8dd49fb8650c83add5e57779fc7a057d5451f8523ad7`, com leitura de volta da release ativa e conteúdo validado.
- **Testes:** 718/718 testes de código e 59/59 regras no emulador aprovados no fluxo de publicação. Integrações de Clientes e Vendas/Financeiro aprovadas no PR #49.
- **Correção da causa:** 72 helpers específicos foram movidos do escopo compartilhado para seus blocos `match`, reduzindo 131 funções globais para 59, sem modificar nenhuma das 131 expressões de funções nem as 166 instruções de permissão.
- **Não fechar formalmente M02 ainda:** faltam homologação autenticada de múltiplos perfis/empresas, teste de revogação em tempo real, comprovação do isolamento operacional e conferência de indicadores reais com estornos/atrasos. Evitar operações financeiras reais para homologar.
- **Histórico:** menções anteriores neste documento a “sem deploy” ou “HTTP 503” descrevem etapas passadas, já superadas neste marco.

## 2. Mapa de todos os módulos

Estado formal inicial **A HOMOLOGAR** = existe especificação e indícios de implementação, mas ainda não há fechamento pelo protocolo atual. A coluna "situação observada" é uma triagem, não uma certificação.

| ID | Módulo | Situação observada / necessidade principal | Estado formal |
|---|---|---|---|
| M01 | Master Global | CPF/CNPJ e criação de empresa/Master Local confirmados pelo proprietário. Senha inicial aleatória com exibição única, primeiro acesso obrigatório e recuperação administrativa publicados em Hosting e três Cloud Functions; 663/663 testes automatizados. Falta homologação em conta real e demais fluxos administrativos. | EM HOMOLOGAÇÃO |
| M02 | Empresas/multiempresa | Master Global concede/revoga vínculos privados; Master Local tem Visão Consolidada somente leitura e conferência financeira sob demanda com bloqueio de totais parciais. Código da M02 publicado; isolamento Firestore em produção confirmado no workflow #43994254475 após otimização do escopo das 72 funções. **Ainda pendente: homologação autenticada desktop/mobile com dados reais, conciliação financeira e aceite do proprietário.** | EM HOMOLOGAÇÃO |
| M03 | Login/sessão | Controles previstos; medir lentidão e expiração e resolver D-01 | A HOMOLOGAR |
| M04 | Usuários | Cadastro/convites e ciclo de vida; testar provisionamento e saneamento | A HOMOLOGAR |
| M05 | Cargos/permissões | Regras/guardas; provar cada permissão em UI, backend e Rules | A HOMOLOGAR |
| M06 | Dashboard | Ajustes visuais; PR #31 aberta; conferir indicadores e referências | A HOMOLOGAR |
| M07 | Equipes | Verificar vínculo, contagem e limites de supervisor | A HOMOLOGAR |
| M08 | Clientes | Deduplicação/políticas; homologar cadastro e status | A HOMOLOGAR |
| M09 | Vendas | Núcleo transacional; homologar exceção, parcelas e persistência | A HOMOLOGAR |
| M10 | Cobranças | Visita/não pagamento; testar atualização sem sumir ao navegar | A HOMOLOGAR |
| M11 | Pagamentos | Idempotência prevista; confirmar baixa persistente e latência real | A HOMOLOGAR |
| M12 | Caixas | Duplicidade e layout corrigidos em commits; fechar fluxos reais pendentes | A HOMOLOGAR |
| M13 | Financeiro | Ledger e financeiro empresarial; conciliar dados e homologar exportações | A HOMOLOGAR |
| M14 | Leads | Emissão segura no backend; confirmar rollout frontend e fluxo completo | A HOMOLOGAR |
| M15 | Solicitações/transferências | Confirmar autorizações, motivo, atualização de saldo e avisos | A HOMOLOGAR |
| M16 | Notificações | Deduplicação/sino corrigidos; testar chegada e navegação real | A HOMOLOGAR |
| M17 | Chat | Editor recuperado em commits; envio/anexo/contador aguardam teste real | A HOMOLOGAR |
| M18 | Relatórios | Verificar totais, escopo e exportações reais | A HOMOLOGAR |
| M19 | Auditoria | Trilhas em código; conferir integridade e somente leitura | A HOMOLOGAR |
| M20 | Configurações | Conjunto v27.2; testar persistência e efeito em módulos | A HOMOLOGAR |
| M21 | Assinaturas SaaS | Issue #14 aberta; integração comercial ainda não homologada | A HOMOLOGAR |
| M22 | Interface/performance/offline | Padronização parcial; mobile, cache, latência e fila exigem prova | A HOMOLOGAR |


### M06 — Dashboard do Vendedor: experiência desktop/mobile (20/11/2026)

- **Correção de causa-raiz (20/11):** o master-local.html ainda reservava 54px e margem de 14px para o cabeçalho global contendo apenas o sino, além de forçar display:grid para o vendedor. O cabeçalho passa a ficar oculto nesse perfil, preservando notificações no menu, e o Dashboard tem padding superior de 16px no desktop, mantendo a distância de segurança do cabeçalho mobile. A versão do vendedor-unificado.js foi renovada no HTML principal. Pendente homologação visual autenticada.


- **Referência visual aprovada (20/11, ajuste):** título alinhado à esquerda, ação “Ir para operação” à direita e KPIs em cinco colunas iguais já a partir de 1350px (imagem enviada em 20/11), faixa intermediária responsiva até 1349px, cabeçalho compacto no mobile sem deslocar o conteúdo. Correção apenas de CSS/carregamento e testes de regressão, sem alterar cálculos ou regras do caixa. Pendente comprovação do workflow e homologação visual no navegador autenticado.
- **Correção complementar (20/11):** cabeçalho centralizado com prioridade sobre a regra compartilhada; espaço superior removido apenas no Dashboard do vendedor, respeitando a navegação fixa no mobile; sino duplicado fora do menu lateral ocultado. Testes estáticos direcionados atualizados. Pendente verificar workflow de Hosting e homologação visual autenticada.

- **Estado:** implementação em branch de homologação `feat/m06-dashboard-vendedor-desktop-mobile-20261120`; **NÃO FECHADO**, **NÃO PUBLICADO**.
- **Problema observado:** KPIs em linhas assimétricas e gráfico de série temporal com um único ponto produziam área vazia desproporcional; havia excesso de bordas, tipografia pequena e pouca adaptação mobile.
- **Solução isolada:** camada CSS/JS exclusiva de `body.perfil-vendedor #dashboard`; grade equilibrada de cinco KPIs, cabeçalho limpo, CTA da Operação, detalhamento via cards com teclado, painel diário compacto usando exclusivamente valores já renderizados pelo dashboard autorizado. Para períodos maiores, preserva o gráfico histórico original.
- **Arquivos:** `css/dashboard-vendedor-pro.css`, `js/dashboard-vendedor-pro.js`, `js/vendedor-unificado.js`, `tests/seller-dashboard-expense-sync.test.js`.
- **Regressão focada:** sintaxe dos dois scripts JS validada; seis cenários em DOM simulado passaram (dia com movimento, dia sem movimento, múltiplos dias, isolamento por perfil, carregamento e breakpoint). Os testes integrados de Node e a homologação visual/autenticada em navegador ainda **não** foram executados.
- **Sem alterações** de cálculo, Firebase, permissões, ledger, regras do Firestore ou perfil Master Local.
- **Aceite pendente:** testar em desktop 1440px, tablet 768px e celular 390px/360px; abrir cada card e a Operação, cruzar valores e período com ledger/caixa real, verificar ausência de rolagem horizontal e aprovar a interface.


### M06 — Refinamento de alinhamento do Dashboard do Vendedor (20/11/2026)

- **PR #75:** título deslocado para cima, cinco cards padronizados em largura/altura pela grade responsiva e versões de CSS/JS atualizadas para evitar exibição de arquivos antigos em cache.
- **Escopo preservado:** não altera banco, cálculos, coleções, regras, permissões, outros perfis ou valores exibidos.
- **Conferência:** regressões CSS/M06 adicionadas; a homologação visual autenticada em desktop e mobile e a conciliação de valores continuam necessárias antes do fechamento formal do módulo.

### M06 — Acabamento visual do Dashboard do Master Local (23/11/2026)

- **Layout.** Cabeçalho mobile inspirado em Caixas, indicadores mais compactos, filtro de período acessível no celular e superfícies de gráfico e ranking ajustadas à largura da tela.
- **Visibilidade.** A aplicação de permissões seleciona somente os botões das abas internas. A seção principal também guarda a aba ativa nesse atributo e era ocultada durante a validação de usuário. As permissões das abas e os cálculos do painel foram preservados.
- **Verificação.** Passaram 119 testes direcionados, a validação das nove páginas HTML e a validação da superfície de Hosting. O layout foi verificado no Chromium com login no emulador entre 320 e 1920 px.
- **Estado.** A homologar visualmente com uma conta Master Local em celular e desktop. O módulo segue aberto.

### M07 — Acabamento visual da consulta de Equipes (24/11/2026)

- **Escopo.** Equipes em Configurações → Usuários e permissões no Master Local. Indicadores compactos, busca e filtro reorganizados, tabela em áreas largas e cartões quando o espaço é reduzido.
- **Visibilidade.** A navegação sincroniza a exibição das abas de Configurações e chama a implementação ativa ao trocar de tela. Isso evita que a implementação anterior volte à aba Empresa depois de abrir Usuários e permissões.
- **Comportamento preservado.** A consulta continua restrita à empresa ativa. Os controles reutilizam as ações, filtros e formulários existentes.
- **Verificação.** Passaram 60 testes direcionados e as verificações de integridade HTML e da superfície de Hosting. A barra nativa da tela evita que a adaptação global gere outro botão Buscar.
- **Navegador.** Login e navegação conferidos no Chromium em dez larguras entre 320 e 1920 px. Busca, estado vazio, limpeza, filtro e abertura do editor conferidos com registros de teste em memória devido à instabilidade da leitura do Firestore no emulador.
- **Estado.** Em homologação. Ainda falta conferir a consulta com dados reais de homologação em celular e desktop.

### M11 — Retorno imediato ao registrar baixa (24/11/2026)

- Ao confirmar pagamento ou não pagamento na operação do vendedor, o modal fecha e o card mostra a sincronização. Os saldos e o resultado da cobrança são atualizados após a confirmação do servidor.
- A mesma cobrança fica bloqueada durante o envio. Baixas de clientes diferentes entram na fila do caixa. Em caso de falha, a cobrança volta a aceitar nova tentativa e a tela mostra a mensagem do servidor.
- Passaram 61 testes direcionados. No Chromium, o modal fechou em 3 ms no cenário com servidor simulado em 5 s, e o card confirmou o valor após a resposta.
- **Revalidação em 25/11/2026.** A produção ainda carregava o fluxo que espera o servidor. Atualizada a prévia sobre a versão atual do sistema. No Chromium, com 6 s de espera simulada, o modal da versão de produção levou cerca de 6 s para fechar. A correção fechou em 1–2 ms, exibiu a sincronização, tratou a rejeição e permitiu nova tentativa sem saldo duplicado. Passaram 128 testes direcionados.
- O fluxo segue em homologação com baixas reais do vendedor.

### M12 — Lista de equipes em Caixas no desktop (24/11/2026)

- **Layout.** Um cartão horizontal por equipe, com indicadores mais baixos e acesso ao histórico junto ao resumo. Recebimentos e Recolhimentos foram incluídos no desktop e usam os dados conferidos da jornada.
- **Filtros.** Ativas, Inativas e Todas ficam dentro de Filtros, junto da seleção de equipe e do estado do caixa. Limpar filtros retorna à consulta inicial de equipes ativas.
- **Verificação.** Passaram os 848 testes de `npm run verify`. No Chromium autenticado no emulador, a lista ficou em uma coluna em nove larguras entre 320 e 1920 px. Foram conferidos os filtros de situação, a limpeza, a busca e a abertura do histórico.
- **Estado.** Em homologação. Conferir os valores com jornadas reais no Master Local.

### M12 — Resumo da jornada no cartão de Caixas (24/11/2026)

- **Saldos e movimentações.** Caixa Atual em destaque, com Inicial e Final no mesmo bloco. O Final usa o valor de fechamento quando a jornada está fechada. Vendas, recebimentos, gastos, retiros, ingressos e recolhimentos usam os lançamentos conferidos da jornada exibida.
- **Acompanhamento.** O card mostra o estado do caixa, a quantidade de caixas confirmados no histórico da equipe e o horário da última consulta bem-sucedida ao servidor. O progresso é calculado sobre as cobranças tratadas e previstas da jornada.
- **Refinamento visual.** Caixa Atual ganha hierarquia tipográfica, as seis movimentações compartilham um painel e o rodapé alinha contagens, sincronização, progresso e histórico. A leitura foi conferida em 11 larguras entre 320 e 1920 px no Chromium, com registros simulados, valores longos e progresso visível.
- **Ajuste de composição.** O cabeçalho do cartão exibe o nome da equipe. No desktop, o bloco de saldo acompanha a altura das movimentações e do rodapé. A data operacional aparece imediatamente antes de Caixas no histórico. A posição da data e a leitura do cartão foram conferidas no Chromium em 11 larguras com registros simulados.
- **Verificação.** Passaram os 848 testes de `npm run verify`. Os testes do cartão cobrem jornada aberta e fechada, valores ausentes em histórico parcial e progresso ponderado por cobranças. No Chromium, layout e filtros passaram em nove larguras de 320 a 1920 px. A leitura individual dos caixas no emulador ficou em conferência, com contagem, status e sincronização da listagem verificados.
- **Estado.** Em homologação. A conferência com jornadas reais permanece pendente.

### M12 — Detalhe da jornada da equipe em Caixas (24/11/2026)

- **Layout.** Saldo atual ou final em azul-marinho, com painéis de carteira e desempenho de cobranças. Entradas e saídas têm indicadores coloridos. Caixas dos vendedores e movimentações aparecem lado a lado quando há espaço.
- **Movimentações.** A data selecionada delimita os registros. O filtro separa vendas, recebimentos, não pagamentos registrados, ingressos, saídas e outros lançamentos. Jornadas fechadas carregam os lançamentos ao abrir o detalhe.
- **Verificação.** Passaram os 848 testes de `npm run verify`. No Chromium, a apresentação foi conferida com registros simulados em 12 larguras entre 320 e 1920 px, incluindo o filtro de não pagamentos e a exibição de uma jornada fechada.
- **Estado.** Em homologação com jornadas reais no Master Local.

### M12 — Indicadores e clientes clicáveis na jornada de Caixas (24/11/2026)

- **Indicadores.** Saldo e carteira abrem a composição e o detalhamento. Desempenho leva aos clientes da data. Cada indicador financeiro abre seu tipo de lançamento, com retiradas e recolhimentos em consultas próprias.
- **Clientes.** Recebidos, Não pagos e Pendentes substituem a lista de caixas por vendedor. A situação acompanha a data selecionada. Cada card mostra o número do empréstimo calculado pelo histórico autorizado, venda com e sem juros, pagamento da jornada e do contrato, saldo devedor e atraso atuais. O histórico abre na própria tela.
- **Consulta.** Caixas encerrados usam recebimentos, não pagamentos e pendências registrados no caixa selecionado. Caixas abertos usam a carteira da equipe para localizar cobranças previstas. As leituras preservam o escopo de empresa e, para supervisores, de equipe.
- **Verificação.** Passaram 58 testes direcionados. No Chromium, foram conferidos os nove indicadores, as três situações de cobrança e um histórico de 33 empréstimos com registros simulados, incluindo navegação por teclado, troca para uma jornada encerrada e layout entre 320 e 1920 px.
- **Estado.** Em homologação com jornadas reais do Master Local.

### M12 — Clientes em lista e score de pagamento na jornada (24/11/2026)

- **Layout.** Um cliente por linha em Recebidos, Não pagos e Pendentes, com o score atual no card e o cálculo no histórico de vendas.
- **Cálculo.** Compara os dias corridos entre a contratação e o último vencimento do cronograma com os dias até a quitação confirmada. Quitação até o prazo vale 100. O atraso reduz a nota na proporção dos dias de atraso sobre o prazo contratado, com piso de zero. Para contratos em aberto, conta o maior atraso entre as parcelas em aberto. A média inclui os contratos quitados e os contratos com atraso confirmado. O histórico mostra quantos contratos foram avaliados.
- **Atualização.** O cálculo usa a data de São Paulo, ao consultar a jornada e à virada do dia para uma jornada que permaneça aberta. Usa as parcelas e o histórico disponíveis no escopo autorizado, sem gravar no Firebase.
- **Verificação.** Passaram 60 testes direcionados. O Chromium confirmou a coluna única em 12 larguras, a comparação entre prazo e quitação no histórico e a mudança do score após a meia-noite, com dados simulados.
- **Estado.** Em homologação com contratos reais no Master Local.

### M12 — Atualização do fechamento na lista de equipes (24/11/2026)

- A lista e o detalhe observam o estado dos caixas abertos enquanto a tela está ativa. Uma alteração confirmada no Firestore atualiza a jornada e descarta o resumo anterior. Ao voltar à tela, o Master Local consulta o servidor novamente.
- O teste de regressão cobre fechamento em outra sessão, rejeição de snapshots locais e encerramento da observação ao sair. O fluxo segue em homologação com caixas reais.

### M12 — Elegibilidade de abertura e situação do caixa (25/11/2026)

- Lista, filtros e detalhes exibem Aberto, Fechado ou Em conferência. A situação acompanha a jornada consultada. Um caixa aberto de data anterior permanece Aberto, e uma divergência histórica de outra data não altera a situação exibida.
- Quando existe um caixa aberto que impede a abertura, a tela informa a data confirmada pelo servidor no lote e no calendário. A confirmação do lote exibe as datas que serão abertas. As validações transacionais de elegibilidade permanecem vigentes.
- O calendário começa no mês do dia operacional ou da abertura parcial. A confirmação usa os vendedores retornados pelo servidor e a lista é consultada novamente depois da abertura.
- Passaram 62 testes direcionados. No Chromium, o detalhe alternou Aberto e Fechado por data e o calendário completou a abertura após a liberação simulada do servidor.
- A conferência dos caixas reais da Norte e Sul segue em homologação.

### M12 — Seleção em lote na lista de Caixas (25/11/2026)

- **Selecionar todos** marca as equipes ativas exibidas pela busca e pelos filtros. A lista mostra quantas equipes estão selecionadas e quantos caixas abertos foram incluídos. O mesmo controle desmarca a seleção completa.
- Em **Ações**, a abertura consulta a elegibilidade das equipes selecionadas no servidor. O fechamento apresenta na conferência somente os caixas abertos da jornada exibida nos cartões selecionados ou os caixas marcados individualmente.
- Passaram 63 testes direcionados. O Chromium verificou o controle por teclado, os filtros e os dois fluxos até a confirmação, com dados simulados e larguras de 320 a 1920 px. A etapa seguinte é o aceite em homologação.

### M12 — Barra compacta acima da lista de Caixas (25/11/2026)

- Contagem de equipes, seleção em lote, sincronização e ordenação ficaram na mesma barra. A confirmação ocupa o espaço do indicador de sincronização. Em telas estreitas, os avisos ficam abaixo dos controles e preservam o texto completo.
- Os 63 testes direcionados passaram. O Chromium verificou a lista, seleção, ordenação, busca e avisos entre 320 e 1920 px. Com uma confirmação de abertura, o primeiro cartão subiu 141 px a 1440 px de largura e 90 px a 390 px. Em homologação.

## M02 — Evidências de execução (etapa 1: fronteira de tenant)

- **Achado:** o backend `functions/company-access.js` dispensava `usuario_integro` da verificação de empresa operacional, como se fosse `master_global`.
- **Correção gravada:** `813e519ff6fda04e91fd09e83672423dbfc28d46` — mantém exceção exclusivamente para `master_global`; usuários internos da plataforma ficam sem acesso operacional direto por essa função.
- **Regressões acrescentadas:** `ecea1d1f7174820e9d5b17cb43d0353ac8f623c1` — 4 novos testes em `tests/access-control.test.js` para funcionário interno, tenant correto/incorreto, bloqueio na cópia e Master Global.
- **Validação nesta etapa:** 6/6 cenários simulados executados sobre o código real da função com mocks de banco e erros HTTPS; **a suíte Node completa e o deploy das Functions não foram executados/confirmados aqui**.
- **Preservação:** nenhum arquivo M01 nem regra Firestore alterados nesta etapa.
- **Pendências para avançar:** identificar implantação da seleção de empresa pós-login para usuários multiempresa; impedir alteração de tenant via armazenamento do navegador; homologar read/write de dois tenants e consolidado somente leitura, com Auth/Firestore real; publicar a Function alterada de modo controlado e validar o acesso negado em produção.

### M02 — Etapa 2: hierarquia e consulta delegada (14/11/2026)

- **Hierarquia preservada:** Master Global possui gestão administrativa completa; funcionários ÍNTEGRO não herdam a autoridade global; clientes e seus usuários continuam isolados.
- **Backend:** `functions/master-global-management.js` adiciona `salvarClientesConsultaFuncionario` (somente master global, auditoria, validação de IDs e existência) e `listarClientesConsultaFuncionario` (somente funcionário interno autenticado, consulta de metadados de empresas previamente autorizadas).
- **Rota protegida:** `functions/index.js` usa o callable `solicitarCadastroDuplicadoV27`, protegido por sessão V27.
- **Master Global:** `master-global.html` incorpora ação *Empresas autorizadas* em usuários internos para definir/revogar delegações; a tela interna `usuario-integro.html` mostra somente empresas autorizadas.
- **Escopo:** delegação é **apenas leitura administrativa de identificação e situação da empresa**, não permite escrever ou consultar dados financeiros/operação dos clientes; controles de empresa e perfil seguem aplicáveis.
- **Testes:** 3 cenários adicionados a `tests/master-global-management.test.js`, incluindo negação de autoconcessão, limite por tenant, revogação e IDs inválidos; não há homologação com sessão real registrada nesta etapa.
- **Commits:** `cb127c3` (backend), `58059dc` (rotas), `a7025a6` (campos seguros), `967ed87` (Master Global), `9eaadbb` (painel interno), `1c78b92` (testes).
- **Hosting:** workflow #716 do Firebase Hosting reportou sucesso. **Functions:** workflow específico `deploy-m02-callable.yml` (#1, commit `be71b9c`) concluiu com sucesso no GitHub Actions: `solicitarCadastroDuplicadoV27(southamerica-east1)` atualizada em `integro-novo`, com `Deploy complete!`. Mantida publicação futura somente por acionamento manual.
- **Pendente M02:** segurança e UX da seleção de múltiplas empresas para Master Local quando legalmente vinculado, acesso delegado de funcionários a outros módulos apenas mediante permissão expressa, testes reais de isolamento e leitura cruzada, controle de versões e aceite.

### M02 — Etapa 3: seleção segura de empresa delegada e publicação (14/11/2026)

- **Funcionalidade:** equipe ÍNTEGRO pode selecionar uma empresa da lista delegada na tela `usuario-integro.html` e consultar apenas nome, tipo, situação e liberação administrativa.
- **Autorização real:** `consultarClienteAutorizadoFuncionario` relê `usuarios/{Auth UID}`, valida `clientesLeituraAutorizada` e lê somente `clientes_integro/{clienteId}`; IDs do browser ou armazenamento local não delegam escopo. Consultas fora da lista e após revogação são negadas.
- **Integridade dos indicadores:** `empresaLiberada` considera bloqueio, inatividade e prazo de teste expirado. Tela protege contra resposta antiga sobrescrevendo a nova seleção.
- **Regressões:** 3 novos testes em `tests/master-global-management.test.js`. CI `Auditoria integrada - Integro` execução #424: código/telas/sintaxe, Rules, integração de clientes e integração de vendas/financeiro concluídos com sucesso. `npm run verify`: **646/646 testes aprovados, zero falhas**.
- **Publicação Hosting:** execução #722 do workflow `firebase-hosting-merge.yml` concluída com sucesso. **Cloud Function:** execução #2 do workflow `deploy-m02-callable.yml` ([run 43639117317](https://github.com/integro-app/Integro/actions/runs/43639117317)) concluiu `solicitarCadastroDuplicadoV27(southamerica-east1)` com `Successful update operation` e `Deploy complete!`. Apenas a callable existente foi implantada; nenhuma Rules foi alterada.
- **Controle de publicação:** workflow de Function restaurado para `workflow_dispatch` após deploy, evitando atualizações automáticas de backend em pushes futuros.
- **Commits da etapa:** `89c54f3` (backend), `37c293d` (roteamento), `92cb6e9` (interface), `f80bd3b` (regressões), `de69ed4` (disparo do deploy), `2f3c4fb` (deploy manual).
- **Limites:** mudança de empresa para Master Local com múltiplos vínculos **não está implementada**; cada usuário de cliente permanece vinculado ao tenant individual. Não foi realizada homologação autenticada de produção com funcionários e dados reais neste ciclo. M01 preservada.

### M02 — Etapa 4: isolamento do funcionário no Firestore (16/11/2026)

- **Falha identificada:** as Rules atribuíam bypass geral a `usuario_integro` em leituras/gravações operacionais (vendas, caixas, ledger, parcelas, solicitações, notificações, cargos/equipes e cadastro de empresas), ainda que o backend de consulta administrativa exigisse delegação.
- **Implementado:** removidas as autorizações globais implícitas de `usuario_integro` em `firestore.rules`. `hasTenant()` passa a negar escopo de cliente a funcionário interno mesmo se `clientePlataformaId` for indevidamente informado. Consulta administrativa delegada via callable não foi alterada; notificações diretamente endereçadas ao próprio funcionário e autoridade do `master_global` foram preservadas.
- **Testes adicionados:** dois cenários em `tests/firestore-rules.test.js`: acesso interno delegado sem tenant não consulta dados via SDK; funcionário com tenant preenchido indevidamente também não atravessa fronteiras, incluindo dados financeiros, configurações, logs e catálogos, preservando consultas legítimas do Master Global/Master Local.
- **Evidência:** auditoria integrada `#480`, [run 43939191331](https://github.com/integro-app/Integro/actions/runs/43939191331), todos os quatro jobs aprovados. `npm run verify`: **663/663**; `npm run test:rules` em emulador: **58/58**; integração Clientes: **8/8**; integração Vendas e Financeiro: **23/23**.
- **Commits:** `74911df` e `7dc20fa` (Rules), `7a68ab7` e `bd383d7` (testes/escopo de tenant), `c323d18` (guarda central `hasTenant`).
- **Hosting:** workflow `firebase-hosting-merge.yml` #786 publicado com sucesso, mas Hosting não implanta Rules. `deploy-m02-firestore-rules.yml` preparado somente para acionamento **manual** e implantação isolada das Rules, com testes antes do deploy e sem alteração de Functions. **A publicação das Rules foi tentada em 16/11/2026 e falhou nas três chamadas ao endpoint de verificação remota do Google com HTTP 503.** O comportamento em produção ainda depende da publicação e homologação autenticada.
- **Outros limites de M02:** seleção multiempresa para Master Local e visão consolidada somente leitura ainda pendentes; não declarar módulo fechado.

### M02 — Etapa 8: reconciliação contra ledger sem somar lançamentos duas vezes (branch, SEM DEPLOY)

- **Revisão e correção:** `functions/m02-ledger-audit.js` confronta as `vendas` e os `pagamentos` canônicos com os lançamentos de `lancamentos_financeiros` de chaves determinísticas `lf_venda_...` e `lf_pagamento_...`, conforme `functions/financial-core.js`. Confere tenant, tipo `VENDA/PAGAMENTO`, origem, natureza `DEBITO/CREDITO`, status `CONFIRMADO`, valor em centavos e existência. **O ledger é apenas prova de reconciliação; os lançamentos NÃO são somados novamente ao caixa, carteira ou recebimentos.**
- **Casos bloqueados:** venda ou pagamento sem contrapartida, lançamentos órfãos, documento com ID duplicado/clonado, pagamento cancelado com ledger confirmado, valores divergentes, ausência de balanço `valorTotalVenda = saldoDevedor + totalPago` e registros pertencentes a outro tenant. Venda cancelada não entra na carteira; estorno e cancelamento de pagamento exigem status contábil correspondente.
- **Backend:** `listarIndicadoresFinanceirosConsolidadosMasterLocal` consulta até **1.000 vendas, 1.000 pagamentos e 3.000 lançamentos de ledger por empresa**; acima desses tetos falha com `resource-exhausted`, nunca com total parcial. Faz consultas por lotes de até **3 empresas** para limitar simultaneidade; revalida o acesso às empresas ao fim. Uma divergência de ledger invalida todos os cinco KPIs consolidados (campos `null` e avisos técnicos sem dados pessoais).
- **Estados indefinidos:** `functions/m02-financial-consolidation.js` invalida KPIs afetados caso uma venda ou pagamento tenha status não reconhecido, em vez de ignorar silenciosamente a operação. `functions/m02-ledger-audit.js` trata cancelamento em qualquer um dos campos de status como cancelamento.
- **Interface:** a seção financeira do `js/m02-visao-consolidada.js` mantém a ocultação de valores parciais e traduz até três códigos de divergência em mensagens legíveis, sem mostrar CPF/CNPJ, nomes de devedores, IDs de cobrança ou valores específicos de outras empresas.
- **Testes:** `tests/m02-ledger-audit.test.js` inclui 14 cenários de ledger/estorno/erro/isolamento; `tests/m02-financial-consolidation.test.js` acrescentou 2 cenários de status desconhecido; `tests/master-global-management.test.js` acrescentou 3 cenários de conciliação de endpoint e limite de ledger; `tests/m02-visao-consolidada.test.js` acrescentou 1 cenário de diagnóstico na interface. [Auditoria integrada #524](https://github.com/integro-app/Integro/actions/runs/43968088077) **aprovada integralmente**: **715/715 código, 59/59 regras Firestore/Storage, 8/8 clientes, 23/23 vendas e financeiro**. [Prévia do PR #352](https://github.com/integro-app/Integro/actions/runs/43968087894) aprovada; **sem atualização do Hosting de produção**.
- **Escopo não concluído:** continua faltando snapshot/materialização auditada e escalável por empresa para volumes acima do limite, além de validação dos atrasos contra as parcelas e homologação sobre dados reais. A leitura entre três coleções e diversas empresas não é transação/snapshot atômico; **não representar como fechamento contábil certificado**. Nenhum merge ou deploy de produção autorizado nesta etapa.

### M02 — Etapa 7: Indicadores financeiros consolidados de leitura (branch, SEM DEPLOY)

- **Fonte financeira examinada:** `functions/financial-callables.js`, `functions/seller-collection-corrections.js`, `functions/v27-sales-cancellation.js`, `functions/box-reconciliation.js` e o Dashboard local. Os registros canônicos são `vendas` (saldo `saldoDevedorCentavos`, emprestado `valorEmprestadoCentavos`, datas e sinalização de atraso) e `pagamentos` (`valorCentavos`, status `CONFIRMADO`, sincronização e data operacional). **Não somar pagamentos + ledger + caixa; isso duplicaria recebimentos.**
- **Cálculo puro:** `functions/m02-financial-consolidation.js` calcula carteira atual, saldo sinalizado em atraso, recebido hoje, valor emprestado hoje e quantidade de vendas hoje. Valores são inteiros em centavos; cancelamentos e estornos não contam, correção de pagamento usa o valor atual em vez de somar `deltaCentavos`. Datas observam `America/Sao_Paulo`.
- **Integridade:** IDs e operações duplicadas geram erro; documento sem tenant canônico falha; valores ausentes/invalidos ou status/tempo inconsistentes produzem `null` para indicador afetado, nunca zero inventado. Um valor consolidado só pode aparecer completo se todos os tenants estiverem coerentes. Limite defensivo de **1.000 vendas + 1.000 pagamentos por empresa** (consulta com `limit(1001)`); acima disso, o endpoint falha fechado e exige agregação auditada escalável.
- **Backend privado:** `listarIndicadoresFinanceirosConsolidadosMasterLocal` deriva os tenants exclusivamente da coleção de vínculos privada, **sem aceitar IDs do navegador**. Verifica perfil, estado contratual e vínculos antes **e após** ler os registros. Revogação/alteração de vínculos durante leitura é recusada. A resposta inclui somente os indicadores agregados em centavos, IDs das empresas autorizadas para conferência de escopo e códigos técnicos de pendências; não devolve linhas de vendas, pagamentos ou dados pessoais.
- **Tela:** `js/m02-visao-consolidada.js` traz seção **Conferência financeira do grupo**, ativada somente por botão, sem consulta financeira automática. Exibe cinco KPIs exclusivamente quando `completo=true`, todos os indicadores têm valores válidos e os IDs de empresas são exatamente os mesmos da listagem autorizada; na ausência de integridade mostra mensagem de validação pendente **sem números parciais**. Não altera a empresa operacional nem permite lançamento.
- **Testes:** `tests/m02-financial-consolidation.test.js` adicionou 9 cenários para centavos, correções, cancelamentos/estornos, duplicidades, valores ausentes, overflow, fuso horário e consolidação de múltiplos tenants. `tests/master-global-management.test.js` adicionou 4 cenários de endpoint, tenant adversário, revogação, bloqueio e limite. `tests/m02-visao-consolidada.test.js` adicionou 3 cenários de conferência sob demanda e ocultação de números inconsistentes. CI [auditoria #508](https://github.com/integro-app/Integro/actions/runs/43956446059): **695/695 testes de código, 59/59 Firestore/Storage Rules, 8/8 Clientes e 23/23 Vendas/Financeiro aprovados**, todos os jobs verdes; prévia de PR aprovada, sem publicação em produção.
- **Limites de negócio:** é uma **consulta operacional**, não fechamento contábil certificado nem fotografia atômica de múltiplas empresas. Para escala e apuração definitiva, faltam snapshots agregados e versionados por tenant, conciliação transacional completa de todos os movimentos além da conferência básica de ledger da etapa 8, verificação de atualização de atrasos e homologação contra dados reais com correções/estornos. **NÃO PUBLICADO na produção.**

### M02 — Etapa 6: Visão Consolidada no Dashboard Master Local (branch, SEM DEPLOY)

- **Tela entregue em branch:** botão **Visão Consolidada** inserido no cabeçalho existente do Dashboard do Master Local por um módulo isolado, sem alterar o HTML grande nem os módulos aprovados. O módulo `js/m02-visao-consolidada.js` é carregado sob demanda por `js/master-local.js` somente após perfil Master Local validado.
- **Experiência:** painel premium responsivo com busca por nome, empresas vinculadas, empresa principal, situação contratual e três indicadores (total autorizado, liberadas, indisponíveis). Informa explicitamente que indicadores financeiros consolidados ainda precisam ser homologados. Não exibe saldo, carteira, vendas, pagamentos, CPF/CNPJ, e-mails nem operações.
- **Fonte única:** callable protegida `solicitarCadastroDuplicadoV27` com `__integroRota=MASTER_GLOBAL_ONBOARDING_V1` e `acao=listarEmpresasVinculadasMasterLocal`. Cada abertura/atualização revalida no backend o próprio UID, a empresa principal, os vínculos em coleção privada e os bloqueios atuais dos tenants.
- **Segurança do navegador:** sanitização estrita da resposta para cinco campos permitidos; renderização dos nomes com `textContent` (não `innerHTML`), limpeza da lista após erro/revogação, proteção contra respostas assíncronas antigas, limpeza quando muda a identidade ou perfil, negação de navegação operacional entre empresas. A UI **não altera `State.tenantId`**.
- **Testes:** `tests/m02-visao-consolidada.test.js` integrado ao `npm run verify`, com **9 novos casos de validação/integração**: payload autenticado, tipagem, campos sensíveis, perfis proibidos, empresa revogada, erro, troca de identidade e preservação dos módulos. CI de [auditoria #494](https://github.com/integro-app/Integro/actions/runs/43952095436) aprovado: **679/679 testes de código; 59/59 Rules; 8/8 Clientes; 23/23 Vendas e Financeiro**, sem falhas. Prévia do PR [#322](https://github.com/integro-app/Integro/actions/runs/43952095153) concluída com sucesso, **sem deploy de produção**.
- **Limitação consciente:** esta primeira Visão Consolidada apresenta **somente empresas e contratos**, não somas financeiras. A consolidação de carteira, recebido, vendas e inadimplência exige definir fontes contábeis autoritativas, agregação no backend e testes contra duplicidade/estornos; não exibir valores incompletos ou inventados.
- **Publicação:** NÃO REALIZADA em produção. Branch `feat/m02-master-local-vinculos-leitura-20261116` / [PR #46](https://github.com/integro-app/Integro/pull/46). Implantação somente após autorização posterior do proprietário.

### M02 — Etapa 5: preparação de vínculos multiempresa para Master Local (branch, SEM DEPLOY)

- **Branch de desenvolvimento:** `feat/m02-master-local-vinculos-leitura-20261116`, derivada de `main`, aguardando revisão e autorização explícita de merge/publicação. Nenhuma alteração feita na produção nesta etapa.
- **Master Global:** nova ação “Empresas vinculadas” para Master Local provisionado; seleciona empresas para futura visão consolidada de consulta. A empresa principal é obrigatória e não pode ser removida.
- **Backend (fonte de autorização privada):** `salvarVinculosMasterLocal` valida Master Global autenticado, Master Local com UID canônico, até 25 IDs válidos e únicos, existência das empresas e manutenção da principal; grava em transação auditada na coleção **`vinculos_multiempresa_master_local/{authUid}`**. A coleção é inacessível pelo SDK do navegador nas Firestore Rules atuais (negação padrão). **Não grava permissões em `usuarios/{authUid}`**, pois o perfil do tenant admite edição de certos campos pelos gestores e não pode ser usado como fonte de autorização multiempresa.
- **Leitura Master Local:** `listarEmpresasVinculadasMasterLocal` verifica o próprio UID, status, bloqueios, empresa principal e vínculos atuais; devolve apenas id/nome/situação/empresa principal/disponibilidade, sem CPF, e-mail, caixa, parcelas, saldo, clientes operacionais ou vendas. Empresas revogadas deixam de aparecer na consulta seguinte.
- **Segurança preservada:** `clientePlataformaId` continua a única empresa operacional da sessão. Não há seletor operacional, acesso cruzado a caixas/vendas ou bypass das Rules. O Master Global consulta os vínculos via callable `consultarVinculosMasterLocal`; o Master Local consulta **somente os próprios metadados** pela callable `listarEmpresasVinculadasMasterLocal`. Ambas leem o documento privado em cada chamada, inclusive após revogação. Funcionários internos não podem gerenciar nem consumir vínculos locais.
- **Testes:** sete cenários em `tests/master-global-management.test.js` abrangem concessão, revogação, empresa principal obrigatória, dados sanitizados, bloqueios, tentativas de forjar o perfil do tenant, integridade do documento privado e ausência de troca operacional. Teste de Rules em `tests/firestore-rules.test.js` confirma negação de leitura, listagem e escrita via SDK **inclusive para Master Global**, pois a coleção é exclusiva do backend Admin SDK. PR #46 em rascunho para CI, sem merge/deploy em produção.
- **Pendente:** implementação de visão consolidada somente leitura no painel do Master Local; decisão e implementação posterior de troca segura de empresa operacional com validação de sessão, Firestore Rules e backend, mais homologação real. **NÃO PUBLICADO.**

### M02 — Segunda tentativa de publicação (16/11/2026)

- **Solicitação do proprietário:** “tente novamente” após falha anterior do Firebase Rules.
- **Workflow acionado:** [run 43944097654](https://github.com/integro-app/Integro/actions/runs/43944097654), `deploy-m02-firestore-rules.yml`, exclusivamente `firestore:rules` em `integro-novo`.
- **Validação:** `npm run test:rules` no emulador concluído com **58/58 testes aprovados e zero falhas**.
- **Implantação remota:** três tentativas, todas recusadas com `HTTP 503` no endpoint `firebaserules.googleapis.com/v1/projects/integro-novo:test` (compilação remota); job concluído como `failure`. **Não declarar Rules publicadas.**
- **Ação posterior:** gatilho temporário por push removido; workflow restaurado a `workflow_dispatch`, commit `33cd896`. Nenhuma Cloud Function ou dado operacional foi alterado.
- **Situação:** aguardando funcionamento do serviço Firebase Rules para implantação e testes com usuários reais. M02 permanece **BLOQUEADO PARA PUBLICAÇÃO**.

### M02 — Tentativa de publicação das Rules (16/11/2026)

- **Autorização:** proprietário solicitou expressamente **“publique”**, referente às Firestore Rules da M02; objetivo era publicar somente `firestore:rules` no projeto `integro-novo`, sem alterações de Functions ou dados.
- **CI/deploy:** execução `deploy-m02-firestore-rules.yml`, [run 43940463547](https://github.com/integro-app/Integro/actions/runs/43940463547). Validação em emulador aprovada: **58/58 testes**.
- **Bloqueio remoto confirmado:** Firebase CLI v14.23.0 fez três tentativas no endpoint `firebaserules.googleapis.com/v1/projects/integro-novo:test` e recebeu **HTTP 503** em todas. Workflow encerrou com **failure** na etapa de publicação. **Não há evidência de implantação bem-sucedida das novas Rules**; considerar o projeto de produção com as regras anteriores.
- **Prevenção:** trigger temporário por push foi removido; workflow devolvido a `workflow_dispatch` no commit `532d124`. Não executar novos retries automáticos sem nova verificação da disponibilidade do serviço.
- **Próximo passo:** assim que a API Firebase Rules voltar a funcionar, executar novamente o deploy manual controlado e homologar em produção com funcionário interno, Master Global e Master Local; **M02 segue bloqueada para publicação, não fechada**.

### M01 — Cadastro progressivo por CPF/CNPJ (14/11/2026, BRT)

- **Novo fluxo:** selecionar PF/PJ, digitar CPF/CNPJ com máscara, consultar automaticamente ao completar os dígitos ou sair do campo; dados complementares permanecem ocultos e desabilitados até verificação positiva. Cadastro existente e documento inválido são barrados antecipadamente.
- **Servidor:** `consultarDocumento` em `functions/master-global-onboarding.js` verifica autenticação Master Global, checksum, reserva `documentos_clientes_integro`, `clientes_integro` e `clientes_plataforma`. Resposta expõe apenas disponibilidade e motivo; operação de salvar mantém reserva transacional contra corrida.
- **Regressão:** 3 testes adicionados no arquivo `tests/master-global-onboarding.test.js`, incluindo documento legado, reserva, perfil proibido, fluxo da tela e bloqueio após mudança do documento.
- **Verificação:** execução `Auditoria integrada` #430 aprovada em todos os jobs; `npm run verify` com **651/651 testes aprovados, zero falhas**.
- **Deploy:** Firebase Hosting #729 concluiu com sucesso; Cloud Function `solicitarCadastroDuplicadoV27` atualizada pela execução #3 ([run 43661380149](https://github.com/integro-app/Integro/actions/runs/43661380149)), tentativa 2 concluída com `Successful update operation` e `Deploy complete!`. A tentativa 1 falhou na atualização da Cloud Function, mas o retry teve êxito. Workflow devolvido ao acionamento manual.
- **Aceite parcial do proprietário (15/11/2026):** usuário respondeu **“Validado!”** após testar o fluxo publicado de seleção PF/PJ, máscara, pré-consulta automática e bloqueio/liberação por documento. **Este subfluxo está homologado pelo usuário.** Não há confirmação explícita, nesta etapa, de persistência pós-cadastro, criação de Master Local, bloqueios completos e demais áreas administrativas; **M01 permanece EM HOMOLOGAÇÃO**.

### M01 — Contas Master Local, senha e recuperação (14/11/2026, BRT)

- **Homologação informada pelo proprietário:** empresa ÍNTEGRO e respectivo Master Local criados com sucesso. Considerar criação validada; persistência após novo login, verificação do e-mail de acesso e testes completos de bloqueio ainda não confirmados.
- **Senha inicial:** Firebase Auth já cria uma credencial randômica exclusiva (36 bytes criptográficos + sufixo) e a interface envia link de definição de senha para o e-mail cadastrado. **Não foi implementada senha fixa `123456` em produção**, pois permitiria tentativa previsível de acesso às contas dos clientes.
- **Alteração pelo usuário:** `js/minha-conta.js` exibe formulário de senha atual, nova e confirmação; exige reautenticação no Firebase, mínimo 12 caracteres com letras e números, e encerra sessão após alteração.
- **Recuperação sem e-mail do Master Local:** `master-global.html` adiciona ação `Recuperar acesso` em Masters Locais provisionados; operador Master Global confirma manualmente identidade, gera senha randômica com `crypto.getRandomValues`, invoca callable `redefinirSenhaUsuarioV27`, mostra senha provisória somente uma vez e limpa o conteúdo ao fechar o drawer. Compartilhamento deve ocorrer por canal privado e verificado; não envolve e-mail perdido.
- **Redefinição de subordinados:** Master Local mantém permissões da rotina V27 para usuários da sua própria empresa; o backend `functions/v27-admin.js` agora exige senha de 12 a 128 caracteres com letras e números. Conta Master Global e outro Master Local não podem ser redefinidos por Master Local.
- **Testes:** `tests/password-recovery-m01.test.js` (4 novos testes) incluído no `npm test`; auditoria integrada #437: todas as etapas aprovadas, **655/655 testes unitários aprovados e zero falhas**. Teste funcional com conta real ainda pendente.
- **Publicação:** Firebase Hosting #738 concluiu com sucesso; Cloud Function `redefinirSenhaUsuarioV27(southamerica-east1)` publicada isoladamente no projeto `integro-novo`, workflow `deploy-password-m01.yml` #1 ([run 43662894967](https://github.com/integro-app/Integro/actions/runs/43662894967)) `Deploy complete!`. Workflow restaurado a disparo manual.
- **Risco operacional restante:** recuperação de identidade sem e-mail depende da verificação fora do sistema pelo Master Global; a caixa de seleção apenas registra a declaração, não é prova automática de identidade. Não há declaração de M01 100% fechada.

### M01 — Etapa adicional: guarda de acesso do Master Local (14/11/2026 BRT)

- **Achado:** `criarMasterLocal` podia provisionar conta Auth para cliente com teste expirado, porque verificava apenas `status` e `acessoLiberado`; também não conferia bloqueio divergente entre `clientes_integro` e `clientes_plataforma`.
- **Correção:** reutilizar `empresaLiberada` nas duas coleções, antes de criar usuário no Firebase Auth e novamente dentro da transação, protegendo contra mudança do estado de acesso entre a leitura inicial e a persistência. Clientes ativos permanecem atendidos.
- **Regressões:** `tests/master-global-onboarding.test.js` ganhou 3 cenários: teste expirado, cópia legada bloqueada, reativação que preserva bloqueio manual por usuário e não ressuscita vendedor. `npm run verify`: **658/658 testes** sem falha; auditoria integrada workflow #440 com 4 jobs aprovados; Hosting workflow #742 com sucesso.
- **Publicação da Cloud Function:** workflow `deploy-m02-callable.yml` #4, [run 43663662362](https://github.com/integro-app/Integro/actions/runs/43663662362) **concluído com sucesso** no projeto `integro-novo`, região `southamerica-east1`, função `solicitarCadastroDuplicadoV27`: logs registraram `Successful update operation` e `Deploy complete!`. Apenas essa callable foi atualizada. O workflow foi restaurado ao disparo manual para futuras atualizações de backend.
- **Status:** código, testes e publicação em produção concluídos; validação com conta real de empresa expirada/bloqueada e login do Master Local permanece pendente. **M01 não está fechada**.

### M01 — Senha provisória exibida e troca obrigatória (14/11/2026 BRT)

- **Decisão:** senha inicial individual e aleatória, não `123456` compartilhada. Exibida somente uma vez no popup após criar Master Local, funcionário ÍNTEGRO ou subordinado. Pode ser copiada e compartilhada em canal privado, sem depender do e-mail fictício; link por e-mail continua opcional.
- **Provisionamento:** `functions/master-global-onboarding.js`, `functions/master-global-management.js` e `functions/index.js` retornam senha provisória somente na resposta de criação de conta Auth nova; senha nunca armazenada em Firestore ou logs. Novos perfis canônicos ficam com `trocaSenhaObrigatoria: true` e **`acessoLiberado: false`** até concluírem a troca. Usuários já existentes não são alterados.
- **Primeiro acesso:** `js/primeiro-acesso.js` / `js/auth.js` pedem senha provisória, nova e confirmação, reautenticando no Firebase. `js/services/firestore.js` permite resolver somente a identidade de contas pendentes; os demais acessos seguem bloqueados. A callable existente `solicitarCadastroDuplicadoV27` atende a rota `PRIMEIRO_ACESSO_V1`, verifica próprio UID e tenant, altera a senha no Firebase Auth, libera acesso no perfil, revoga refresh tokens e força novo login.
- **Segurança:** as Rules **já publicadas anteriormente** exigem `acessoLiberado: true` para dados operacionais, portanto o novo cadastro sem acesso não exige alteração das Rules em produção. Backend `iniciarSessaoV27` e `session-authorization.js` também respeitam o estado pendente. Mudanças adicionais de Rules foram testadas no emulador, mas **não publicadas**, devido HTTP 503 do serviço Firebase Rules; não são pré-requisito para o novo bloqueio.
- **Testes:** novos cenários em `tests/primeiro-acesso-m01.test.js`, `tests/auth-diagnostics.test.js`, `tests/master-global-management.test.js` e `tests/master-global-onboarding.test.js`. `npm run verify`: **663/663 testes aprovados, zero falhas**. `npm run test:rules` no emulador passou preservando supervisor, ledger e caixa.
- **Publicações comprovadas:** Firebase Hosting `#780` (e `#777`) com sucesso; as três Cloud Functions `provisionarUsuario`, `solicitarCadastroDuplicadoV27`, `iniciarSessaoV27` atualizadas em `southamerica-east1` no projeto `integro-novo`, workflow `deploy-m01-primeiro-acesso-functions.yml` #3 [run 43666820433](https://github.com/integro-app/Integro/actions/runs/43666820433), com `Successful update operation` e `Deploy complete!`. Workflow de Functions restaurado para acionamento manual após deploy.
- **Pendente de aceite real:** criar conta com e-mail fictício, copiar senha única, entrar, informar senha antiga e criar/confirmar nova, verificar sessão bloqueada antes da troca e novo login funcionando depois. **M01 permanece EM HOMOLOGAÇÃO**, sem declaração de fechamento formal.

### M22 — Padronização da navegação e dos componentes (23/11/2026)

- Branch `feat/padronizacao-global-integro-20261123` e [PR #94](https://github.com/integro-app/Integro/pull/94). Navegação desktop/mobile, componentes compartilhados e telas do Master Global integrados a partir da versão de Caixas da `main`.
- Corrigida a disputa entre as camadas de visibilidade do painel, que ocultava Caixas mesmo quando o módulo estava autorizado. Corrigida também a inicialização do serviço do Vendedor enquanto o caixa ainda carrega.
- **Em homologação.** A matriz, as capturas e as pendências da auditoria integrada estão no [registro de validação](evidencias-homologacao/2026-11-23-padronizacao/README.md).

## 3. Protocolo de avanço (sem pular tópicos)

1. **ALINHAMENTO:** congelar o escopo exato do tópico ativo, regras do proprietário, perfis, botões e comportamento esperado; resolver divergências pertinentes.
2. **INSPEÇÃO:** conferir código real no GitHub, branch e ambiente; listar inconsistências e riscos entre os requisitos e a implementação atual.
3. **CORREÇÃO:** implementar diretamente no fluxo do repositório; preservar o que já funciona e não incluir mudanças desconectadas.
4. **VERIFICAÇÃO:** executar testes de sintaxe, unitários, regressão, integração/Rules/Functions quando cabível; reportar quantidade/resultado **executados de fato**.
5. **PUBLICAÇÃO:** commit, PR/merge quando aplicável, deploy controlado **somente com autorização e pré-requisitos comprovados**; registrar hash e destino.
6. **HOMOLOGAÇÃO:** testar fluxos completos com dados e perfis reais de homologação, interface desktop e celular, persistência no Firestore/ledger e cenários negativos.
7. **ACEITE:** confrontar cada requisito/cenário, registrar evidências, corrigir todos os defeitos críticos/altos e pedir/registrar aprovação do usuário. Só então declarar **100% FECHADO**.

**Importante:** se publicar não for autorizado/possível e a publicação for necessária para provar uma regra, o tópico fica **BLOQUEADO** ou **EM HOMOLOGAÇÃO**, não 100%.

## 4. Condições objetivas para o selo '100% FECHADO'

- [ ] Todos os requisitos do tópico (IDs na especificação) avaliados; divergências pertinentes encerradas ou explicitamente excluídas pelo proprietário.
- [ ] Botões, campos, menus, estados, cálculos, filtros e mensagens do escopo funcionam com dados reais de homologação.
- [ ] Autorizações válidas e proibidas testadas por perfil, empresa e equipe; testes negativos de acesso cruzado.
- [ ] Criação e persistência confirmadas em banco e UI após recarregar/trocar tela/logar novamente.
- [ ] Corridas, duplicidade, idempotência, reexecução/estorno e falhas de rede cobertas quando o tópico tem impacto financeiro.
- [ ] Testes automáticos aplicáveis executados, com resultado e limitações registrados.
- [ ] Teste visual/funcional desktop e mobile para todas as interfaces afetadas.
- [ ] Versão e publicação de Hosting/Rules/Functions/Indexes compatíveis e comprovadas, onde necessário.
- [ ] Sem erros P0/P1 no tópico e sem regressão conhecida em módulo dependente.
- [ ] Evidências registradas (IDs sem dados sensíveis, logs, captura de tela, resultado esperado/obtido, commit/PR, deployment).
- [ ] **Aceite expresso do proprietário** após homologação real.

## 5. Ficha obrigatória de um tópico

Copiar/atualizar esta seção **na mesma ficha ativa** a cada rodada. Não criar uma nova lista concorrente para a mesma pendência.

```md
### TÓPICO ATIVO — Mxx / nome do subfluxo
- Estado: EM ALINHAMENTO | EM DESENVOLVIMENTO | EM HOMOLOGAÇÃO | BLOQUEADO | 100% FECHADO
- Início: AAAA-MM-DD
- Objetivo de negócio:
- Requisitos vinculados: Mxx-Rxx, ...
- Fluxos e perfis:
- Versão inicial / branch / commit:
- Achados reproduzidos:
- Alterações efetuadas:
- Testes realmente executados (com resultados):
- Deploy realmente executado (projeto, componentes, versão, data):
- Homologação manual (desktop/mobile, usuário/perfil, resultado):
- Persistência em Firestore/ledger:
- Regressões verificadas:
- Pendências P0/P1:
- Pendências P2/P3:
- Critérios de aceite comprovados:
- Evidências (links/IDs não sensíveis):
- Aceite do proprietário, data e mensagem:
- Veredito: NÃO FECHADO | 100% FECHADO
```

## 6. Log inicial de evidências e bloqueios

| Data | Escopo | Evidência consultada | Consequência |
|---|---|---|---|
| 06/11/2026 | Geral | `docs/MATRIZ-HOMOLOGACAO-v27.2.md` e documentos históricos | Indícios de código não equivalem a homologação operacional |
| 06/11/2026 | Caixas | Commits recentes de correção de duplicidades, status e botões; issue #15 | Prioridade sugerida para fechamento real |
| 06/11/2026 | Caixa supervisionado | [PR #2](https://github.com/integro-app/Integro/pull/2) aberta | Não tratar a regra de conversão auditável como lançada |
| 06/11/2026 | Dashboard | [PR #31](https://github.com/integro-app/Integro/pull/31) aberta | Layout de referência não pode ser marcado entregue |
| 06/11/2026 | SaaS comercial | [Issue #14](https://github.com/integro-app/Integro/issues/14) aberta | Faturamento Pix/assinatura não homologado |
| 06/11/2026 | Notificações de leads | Commit `374b552` na main; PR #35 inclui etapa backend | Confirmar workflow/Function, integração do navegador e notificação real |
| 06/11/2026 | Chat | Commits de reparo do editor, anexos e não lidas | Ainda exige envio e recebimento real nos dispositivos |
| 12/11/2026 | M22 / Operação vendedor | [CI 43239829227](https://github.com/integro-app/Integro/actions/runs/43239829227) na branch de correção: 59/59 focados, 596/596 gerais, integridade HTML/JS/Hosting/Functions aprovada | Correções só na branch; sem merge, deploy ou homologação visual autenticada |

## 7. Tópico ativo — M22 / Navegação do vendedor (06/11/2026)

- **Escopo pedido:** vendedor padrão sem filhos Cobranças/Vendas na sidebar. Clique em **Operação** abre diretamente cobranças e expõe duas abas **Cobranças** e **Vendas** na parte superior da tela.
- **Implementação em branch:** `fix/vendedor-operacao-abas-topo-20261106`; ajuste localizado em `js/integro-menu-categorias.js` e `css/integro-visual.css`; tela `js/vendedor-unificado.js` preservada.
- **Regressão adicionada:** `tests/sidebar-navigation-regression.test.js` (valida ausência de submenu para vendedor, rota de Operação e visibilidade das abas).
- **Testes executados até aqui:** comparação estática de trechos gravados no GitHub; **suite Node e teste em navegador ainda não executados nesta rodada**.
- **Deploy:** não executado; aplicação publicada não foi alterada.
- **Aceite pendente:** testes de regressão/CI e, após publicação autorizada, clique em Operação, alternância das duas abas, esconder menu, desktop/mobile, e preservação das permissões.
- **Veredito:** EM DESENVOLVIMENTO / HOMOLOGAÇÃO PENDENTE — **NÃO FECHADO**.

## 8. Definição de continuidade

- A instrução **"avance"** significa prosseguir **no tópico ativo**, primeiro corrigindo o que ainda o impede de passar.
- Não mudar de módulo por conveniência nem declarar 'concluído' em razão de commit.
- Se um tópico aparentar estar perfeito, executar seus testes negativos e regressões antes de fechar.
- Depois do **100% FECHADO**, iniciar o próximo tópico definido na sequência priorizada sem reabrir o anterior, salvo regressão comprovada ou nova regra do proprietário.
- Conservar histórico de versões e decisões, sem apagar o que foi estabelecido antes.

**Este é o controle oficial de acompanhamento.** O código-fonte continua sendo prova da implementação; o dossiê de aceite é prova da conclusão operacional.

### M22 — Conciliação de carteira e fechamento (20/11/2026)
- **Estado: EM HOMOLOGAÇÃO, NÃO PUBLICADO, NÃO FECHADO.** PR [#78](https://github.com/integro-app/Integro/pull/78), branch `fix/m22-conciliacao-carteira-caixa-20261120`.
- **Causa comprovada no código:** conferência contabilizava a autoria histórica da venda em vez do responsável atual do cliente; transferência de carteira atualiza cliente, não a autoria da venda.
- **Alterações isoladas:** rota no servidor consulta proprietário canônico do cliente e suas vendas referenciadas; tela Cobranças e regra de leitura priorizam o proprietário atual; testes para cliente transferido, venda antiga e legados. Nenhuma baixa, ajuste financeiro ou migração de dados reais executada.
- **Testes:** CI de código inicial: 761/761 aprovados; auditoria completa e emuladores devem ser confirmados para o último SHA da PR. Publicação em produção depende de autorização e homologação com o caso real das cinco pendências.
- **Risco/dependência:** pagamentos de vendas anteriores após transferência podem exigir evolução de autorização operacional e conciliação da migração; verificar antes de declarar o fluxo completo.
- **Próximo aceite:** conferir, no Firebase real, as cinco vendas e seus clientes canônicos e comparar Cobranças × Conferência do caixa para vendedor e gestor. Não forçar fechamento sem confirmação.

### M22 — Quitados indevidamente cobrados no fechamento (20/11/2026)
- **Estado:** correção em branch `fix/m22-quitados-nao-bloqueiam-rota-20261120`; NÃO publicado, NÃO homologado.
- **Causa técnica:** a rota no backend não descartava vendas com `statusVenda=QUITADO`, enquanto a tela do vendedor as oculta; histórico de parcelas pendentes e saldos residuais podia produzir cobranças invisíveis.
- **Solução:** filtrar vendas encerradas e clientes quitados da rota, preservar pagamentos do caixa; se venda/cliente marcado QUITADO ainda conserva saldo contraditório, mostrar aviso detalhado e bloquear por conciliação financeira, nunca por visita não realizada. Sem alterar dados, saldos ou históricos reais.
- **Teste obrigatório:** reconsultar as cinco vendas apontadas no fechamento e verificar situação, saldos e propriedade em Firestore; confirmar que cobranças reais permanecem e que casos quitados não geram pendência.
- **Auditoria de produção (somente leitura, 20/11/2026):** os cinco IDs completos exibidos no bloqueio (Maria do Carmo, Henrique Soares Muniz, Rafael dos Santos, Pizzaria, Francisco Almeida) são vendas antigas com `ATIVA`, saldos não zerados, vendedor histórico comum e caixas de origem já `FECHADO`. Os cinco clientes foram localizados apenas em `clientes` (legado), sem ficha correspondente encontrada em `clientes_operacionais`. A ficha legada de Maria consta `QUITADO` com saldo contraditório; as outras constam `ATIVO`. Não houve escrita na base.
- **Causa específica comprovada:** a tela do vendedor usa só `clientes_operacionais`, mas a conferência incluía contratos de `clientes` legados de caixas antigos como visitas obrigatórias no caixa atual. A mera troca de status QUITADO não resolveria os cinco casos.
- **Tratamento proposto no PR:** separar contratos históricos sem ficha operacional e sem movimentação no caixa atual em alertas de conciliação não bloqueantes; preservar a dívida e os registros originais sem baixa fictícia. Fichas canônicas com parcelas vencidas continuam bloqueando. Caixa de origem atual ou movimentações reais do caixa atual não recebem exclusão automática.
- **Próximo passo:** verificar CI na versão final, publicar código quando autorizado, repetir fechamento autenticado e elaborar migração auditável das fichas legadas para `clientes_operacionais` sem alterar contratos financeiros.

## 9. Atualização — M22 / Operação do Vendedor (12/11/2026)

- **Base:** `main` em `45019b73d732d3eef10c128452c088e2904b1e0b`.
- **Branch isolada:** `fix/m22-operacao-vendedor-permissoes-abas-20261112`. **Sem merge na main**.
- **Achado 1:** a abertura sempre ativava Cobranças mesmo quando o vendedor tinha somente permissão de Vendas. `js/vendedor-unificado.js` agora seleciona somente abas autorizadas, incluindo negação sem permissão, sem alterar ações de pagamento ou caixa.
- **Achado 2:** `css/integro-visual.css` ainda especificava duas colunas para três ações do topo (Cobranças, Vendas e Fechar caixa). Ajustada a declaração mobile para três colunas, respeitando o restante da estilização.
- **Regressões:** `tests/sidebar-navigation-regression.test.js` exercita quatro perfis de permissão usando o código real extraído em VM e verifica três colunas. `tests/vendedor-unificado-operacao.test.js` foi adaptado à nova guarda de autorização.
- **Primeira rodada CI:** [43239304725](https://github.com/integro-app/Integro/actions/runs/43239304725), 58/59 testes focados; 1 asserção estática antiga incompatível com a nova guarda. Corrigida a expectativa do teste, sem restaurar comportamento inseguro.
- **Rodada CI válida:** [43239829227](https://github.com/integro-app/Integro/actions/runs/43239829227), 59/59 testes focados e 596/596 gerais aprovados; `npm run verify` concluiu também HTML, scripts inline, sintaxe JS, superfície Hosting e sintaxe Functions.
- **Execução de CI:** workflow temporário limitado à branch, sem execução de deploy, removido ao final dos testes.
- **Não executado nesta rodada:** teste manual com login no Hosting, comparação visual em celular/desktop, persistência real Firestore, teste offline/rede, auditoria de permissões nas Rules/Functions. Esses itens não podem ser inferidos do CI.
- **Publicação:** não executada; nenhuma PR foi aberta, pois o workflow existente de PR aciona deploy de prévia Firebase automaticamente.
- **Próximo passo para homologação:** revisar alterações, publicar apenas sob autorização, testar Operação → Cobranças/Vendas/Fechar caixa com perfil vendedor e credenciais de homologação, confirmar permissões restritas, layout no celular, alternância e ausência de regressão de baixas.
- **Veredito:** **EM HOMOLOGAÇÃO PENDENTE / NÃO FECHADO**. A aprovação automatizada não equivale a aceite operacional nem encerra o M22 transversal.

## 10. Frente comercial integrada M08/M09/M12 — 12/11/2026

- **Branch de apresentação:** `feat/demo-cliente-venda-caixa-20261112`, derivada da correção M22. **Sem merge na main.**
- **Novo cadastro (M08):** seller consulta CPF/CNPJ antes de cadastrar; callable `consultarDocumentoClienteV27` acessa somente dados do tenant no servidor, permite reencontrar cliente próprio sem expor documentos de outra carteira.
- **Duplicidade:** bloqueia CPF/CNPJ existente em `clientes_operacionais` e na coleção legada `clientes`. Solicitação passa por `solicitarCadastroDuplicadoV27` e supervisor/gerente pode decidir por `decidirCadastroDuplicadoV27`; autorização expira e é consumida no primeiro cadastro autorizado.
- **Escrita:** `cadastrarClienteOperacionalV27` exige sessão/tenant/ator vendedor/equipe, confere documento e telefone no Firestore dentro de transação, vincula `clientes_operacionais` e `clientes`, reserva documento e audita. Novo fluxo não grava baixa de caixa fictícia.
- **Venda (M09):** `Nova venda` consulta documento e apresenta ficha de cliente próprio ou novo cadastro. Após cadastro seguro, continua na simulação de principal, juros, total e parcela. Confirmação mantém `IntegroVenda.registrarVendaTransacional` com autorização/caixa/ledger existentes, sem simular quitação nem aprovação.
- **Caixa (M12):** tela de conferência evidencia snapshot oficial e permite atualizar valores. Continua bloqueada a confirmação sem baixas e conferência e continua exigindo backend `registrarFechamentoCaixaTransacional`; nenhuma movimentação financeira alterada neste ajuste.
- **UI:** alterações localizadas no vendedor e CSS responsivo, incluindo controle de permissões das abas já tratado no M22.
- **Índices:** foram acrescentados três índices compostos de CPF/CNPJ e telefone por tenant no `firestore.indexes.json`. **Ainda dependem de deploy de índices.**
- **Teste:** suíte focada, suíte geral e verificadores HTML/JS/Hosting/Functions via workflow temporário da branch; registrar link e contagem da execução final aprovada nesta ficha.
- **Pendente obrigatoriamente:** confirmar índice ativo, implantação autorizada das duas Functions e do Hosting, teste Firebase Auth/Firestore real com dois tenants e vendedores diferentes, disparo/decisão de solicitação, cadastro/duplo clique/rede, atualização de carteira/venda/parcelas/ledger e fechamento de caixa real em dispositivo móvel.
- **Importante:** anexos do formulário nesta fase são apenas nomes de arquivo; upload efetivo para Storage não está incluído neste escopo.
- **Veredito:** **EM DESENVOLVIMENTO/HOMOLOGAÇÃO**. Não há autorização para considerar concluído ou apresentado como produção.

## 12. M01 / Master Global — cadastro do cliente ÍNTEGRO e Master Local (13/11/2026)

- **Estado:** EM DESENVOLVIMENTO / HOMOLOGAÇÃO PENDENTE. Branch `feat/m01-master-global-onboarding-20261113`, [PR #43](https://github.com/integro-app/Integro/pull/43). **Sem merge/deploy em produção.**
- **Achado:** `master-global.html` tentava gravar `clientes_integro` diretamente apesar de `firestore.rules` proibir create/update; Master Local era salvo como convite sem Auth funcional.
- **Implementação:** quatro callables `salvarClienteIntegroGlobal`, `alterarAcessoClienteIntegroGlobal`, `ativarTesteClienteIntegroGlobal` e `criarMasterLocalGlobal`, todas protegidas por sessão e perfil. Backend valida CPF/CNPJ, verifica duplicidade, reserva documento, sincroniza `clientes_integro`/`clientes_plataforma`, registra logs e cria usuário canônico no Firebase Auth/Firestore com rollback. UI orienta cadastro do Master Local e envio de link para definir senha, sem compartilhar senha.
- **Segurança:** login global não aceita associação por e-mail sem UID; operações administrativas críticas não usam gravação direta do navegador. **Bloqueio integral no Firestore/Storage NÃO homologado:** duas tentativas de Rules causaram regressão por limite de 1000 expressões no emulador; alterações de Rules revertidas integralmente. O backend financeiro já verifica bloqueio/expiração, mas leituras diretas ainda exigem correção posterior sem regressão.
- **Testes adicionados:** `tests/master-global-onboarding.test.js` e inclusão no `npm test`; sintaxe do novo backend incluída em `test:functions:syntax`.
- **Pendente:** CI do último commit, deploy autorizado de Functions/Hosting e testes reais com Master Global, documento duplicado, Master Local provisionado, entrega de e-mail, primeiro login, bloqueio de tenant e isolamento entre empresas. **Não marcar 100% sem evidências.**

## 13. M01 — Contingência de implantação por IAM (13/11/2026)

- **Hosting:** publicado no Firebase após merge da PR #43 (`313c9a12`).
- **Functions novas:** falha confirmada no [run 43487654006](https://github.com/integro-app/Integro/actions/runs/43487654006): erro interno de criação Gen1 em três endpoints e falta de permissão IAM para definir invoker no quarto. Não declarar onboarding funcional neste estado.
- **Correção:** PR de contingência `fix/m01-master-global-deploy-existing-callable-20261113` passa as quatro ações por `solicitarCadastroDuplicadoV27` (endpoint existente e invoker já aprovado), sob rota `MASTER_GLOBAL_ONBOARDING_V1`, sessão V27 obrigatória e autorização de Master Global validada no servidor. Remove exports das quatro novas Functions para não exigir IAM adicional.
- **Deploy:** workflow `master-global-functions-deploy.yml` atualizado para publicar exclusivamente a callable existente. Homologar CI, deploy e cadastro real antes de fechar M01.

## 14. Auditoria de fechamento M01 — Master Global (13/11/2026)

- **Escopo prioritário solicitado:** conferir e concluir telas, botões, formulários, dados, vínculos, usuários, planos, departamentos, notificações, chat, configurações, auditoria e relatórios.
- **PR:** [#45 — Fechamento M01](https://github.com/integro-app/Integro/pull/45); branch `feat/m01-master-global-complete-20261113`. **Estado nesta atualização:** implementação submetida à CI; **não considerar publicada antes de workflow concluído**.
- **Achados confirmados no código:** usuários internos eram criados sem Auth; planos/departamentos/configuração tentavam gravação direta em coleções sem Rules; logs globais eram ilegíveis diretamente; notificações globais não podiam ser marcadas lidas; botões editar ignoravam IDs; configurações não eram recuperadas; relatórios ausentes; chat exigia tenant que Master Global não possui.
- **Implementação:** backend `master-global-management.js` sob callable existente `solicitarCadastroDuplicadoV27`, sessão V27 e perfil global; criação/edição de usuário interno com Auth e UID canônico; edição de Master Local; planos/departamentos com estado e validação; configuração persistente; avisos globais com leitura por usuário; listagem de logs; relatórios CSV com distinção explícita entre mensalidade potencial e receita recebida; chat administrativo isolado; erros de consulta não viram zeros.
- **Segurança:** bloqueio do cliente ÍNTEGRO revoga `acessoLiberado` e marca `empresaBloqueada` em seus usuários de forma transacional (limite explícito de 350 usuários); reativação restaura o estado individual anterior, sem liberar usuários já bloqueados. As Rules e a sessão existentes já exigem `acessoLiberado=true`. Tentativa de acrescentar expressão de Rules para flag adicional causou regressão no emulador (limite de 1000 expressões) e foi **revertida integralmente**; nenhuma alteração em Rules será publicada neste escopo.
- **Testes:** `tests/master-global-management.test.js`, ampliação de `tests/master-global-onboarding.test.js` e `tests/firestore-rules.test.js`. CI inclui regressões financeiras, clientes, Auth/Firestore e Rules.
- **Portal interno:** `usuario-integro.html` criado e rota de login do perfil `usuario_integro` corrigida; `Validators.validarUsuario` passa a permitir usuários internos sem tenant, mantendo a exigência para operadores. Portal mostra somente perfil, avisos e chat autorizados, sem CRUD do Master Global. O endpoint `provisionarUsuario` existente passa a exigir sessão válida e empresa operacional ativa.
- **Saneamento legado:** usuários internos criados anteriormente sem Auth recebem ação explícita `Provisionar Auth`, que cria perfil canônico, inativa o registro legado e gera link de senha; conflitos com Auth preexistente exigem reconciliação manual, sem assumir identidades por e-mail.
- **Dependências que impedem 100% nesta fase:** testes manuais com Master Global e usuário interno reais, e-mail de ativação, primeiro login, inspeção visual desktop/mobile, bloqueio/reativação real do tenant, verificação de expiração automática de testes no acesso direto Firestore/Storage, integração de faturamento efetivamente recebido (M21), escala/paginação além de limites seguros, validação do chat por usuários internos fora da tela Master Global e aceite do proprietário.
- **Veredito:** **NÃO FECHADO** até conclusão das evidências de homologação; não confundir deploy/CI com 100% operacional.

## 15. M01 — Evidências de publicação e homologação técnica (13/11/2026)

- **Merge:** [PR #45](https://github.com/integro-app/Integro/pull/45), commit de produção `28ad161a77bcf7944a638a6a6ec8b3f3f8871309`.
- **CI da versão aprovada:** [Auditoria integrada 43512447208](https://github.com/integro-app/Integro/actions/runs/43512447208): **636/636 testes de código aprovados**, integridade de 9 HTML, scripts inline, sintaxe JS, Hosting, integrações Auth/Firestore de Clientes, Vendas/Financeiro e Rules/Storage aprovadas.
- **Hosting:** [deploy 43512820209](https://github.com/integro-app/Integro/actions/runs/43512820209) **sucesso**; inclui `master-global.html` e novo `usuario-integro.html`.
- **Backend Master Global:** [deploy 43512820602](https://github.com/integro-app/Integro/actions/runs/43512820602) **sucesso**; callable existente `solicitarCadastroDuplicadoV27` atualizada, seguida de `provisionarUsuario`; **636/636 testes gerais e 11/11 testes de onboarding aprovados**.
- **Smoke test externo sem login:** `usuario-integro.html` retornou HTTP 200, encaminhou usuário não autenticado ao login e não exibiu conteúdo interno.
- **Regras:** `firestore.rules` e `storage.rules` não foram alteradas no merge. O bloqueio de tenant passa a revogar `acessoLiberado` dos usuários por transação, respeitando as Rules existentes.
- **Pendências impeditivas de 100%:** ainda não foram realizados testes autenticados reais de cadastro de cliente, plano, Master Local, usuário interno, e-mail, login, bloqueio/reativação, avisos, chat, relatório CSV, nem validação visual com sessão real em desktop/mobile. A expiração automática do teste em acesso direto a dados, o suporte a empresas com mais de 350 usuários e faturamento efetivamente recebido (M21) seguem pendentes.
- **Estado formal:** **EM HOMOLOGAÇÃO / NÃO FECHADO**. Publicação e testes automatizados concluídos; o aceite operacional exige evidências com contas reais e aprovação do proprietário.


### M03 — Card único de carregamento de login (19/11/2026)

- **Diagnóstico:** duas estruturas de loading com CSS e logos distintos entre `index.html` e painéis, criando troca perceptível de tamanho/posição. Master Global ainda mostrava `ÍNTEGRO.` em vez de `ÍNTE` branco + `GRO` laranja; alguns perfis reiniciavam a porcentagem da etapa visual em zero após navegação.
- **Correção em homologação:** um conjunto de estilos autoritativo em `css/integro-loading.css` para login e boot dos perfis (mesmas dimensões, centralização, cores, spinner e posição da barra); cache atualizado em login/Master Local/Master Global/Vendedor; logos e títulos unificados; `js/integro-loading-handoff.js` restaura imediatamente o percentual do login e `master-global.html`/`vendedor.html` respeitam a progressão contínua; `js/auth.js` atualiza ARIA.
- **Regressão:** `tests/production-shell.test.js` verifica consistência do HTML/CSS e progresso monotônico na troca de rota. Sem alterações nas regras Firebase, contas, sessão e negócio.
- **Status:** em desenvolvimento/homologação, sem merge/deploy em produção; falta CI e conferência visual/autenticada de login, transição e mobile para aceite final. M03 permanece aberto.
